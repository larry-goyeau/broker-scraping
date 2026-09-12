// What one round trip costs at eToro Global: buy n shares at price p, sell
// them back at once (online, real stock / ETF / coin, non-club).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The stock ticket is a flat dollar
// amount every order, so it lives in `c`. Crypto 1 % and the CFD 0.15 % sit
// in `a`. There is no published minimum of a %, so the floor stays empty.
//
// eToro (Europe) Ltd / eToro (UK) Ltd, fees page read 2026-09-10. Default is
// the country-picker majority: $2 on Australia / Hong Kong / Dubai / Abu
// Dhabi / Tokyo, $1 on every other stock exchange, each way. Australia and
// New Zealand are $2 everywhere (`--plan=anz`). The United Kingdom, Ireland
// and the countries that are not in the picker pay $0 (`--plan=uk`). eToro
// US, Club, CopyTrader, Smart Portfolios, recurring buys, Stock Margin
// (0.15 %) and futures are not this trip.
//
//   stocks (real)   $1 or $2 each way, in USD regardless of the listing
//   ETF / ETC       $0  (the page names ETFs; ETC share the invest book)
//   CFD stock/ETF   0.15 % each way, no ticket; US ≤ $3 is 0.02 $/share
//   crypto          1 % each way (Bronze / Silver / Gold, $0–$10 k)
//                   real coins only; leveraged crypto CFDs are out
//
// The $1 / $2 does not apply to ETFs, CFDs, Copy or Smart Portfolios. A
// catalogue row with `cfd: true` is the CFD book for that line (US ETFs
// on the global platform, some HK names). Market spread is the venue book,
// not an eToro markup, and sits in `a` / `b` like every other file. They
// print "no additional broker fees" on real stocks, so SEC / TAF stay out.
// Stamp / FTT from the tax map; else their printed UK 0.50 % on a London
// STOCK. Cash can sit in USD and, where offered, GBP / EUR / AUD / DKK;
// conversion is 0.75 % (local ↔ USD) only if the wallet is the wrong
// currency, so FX stays out of `a`. Custody 0, inactivity 0. No live trip:
// the coefficients are the printed $ / %.
//
//   https://www.etoro.com/trading/fees/
//   https://www.etoro.com/trading/fees/conversion/
//   https://www.etoro.com/wp-content/uploads/2025/07/Cost-and-Charges-examples-table-Crypto-Fees-in-May-2025.pdf
//
//   node etoro/etoro_cost.mjs AAPL
//   node etoro/etoro_cost.mjs VUSA EURONEXT EUR
//   node etoro/etoro_cost.mjs 00001.HK HKEX HKD
//   node etoro/etoro_cost.mjs BTC
//   node etoro/etoro_cost.mjs AAPL NASDAQ USD --plan=uk
//   node etoro/etoro_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("etoro-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.etoro.com/trading/fees/",
  conversion: "https://www.etoro.com/trading/fees/conversion/",
  examples:
    "https://www.etoro.com/wp-content/uploads/2025/07/Cost-and-Charges-examples-table-Crypto-Fees-in-May-2025.pdf",
  readOn: "2026-09-10",
  entity: "eToro (Europe) Ltd / eToro (UK) Ltd",
};

const DEFAULT_PLAN = "standard";
const PLANS = {
  standard: { id: "standard", label: "Standard", asiaMe: 2, other: 1 },
  anz: { id: "anz", label: "Australia / New Zealand", asiaMe: 2, other: 2 },
  uk: { id: "uk", label: "UK / Ireland", asiaMe: 0, other: 0 },
};
const PLAN_ALIAS = {
  standard: "standard",
  default: "standard",
  retail: "standard",
  eea: "standard",
  eu: "standard",
  anz: "anz",
  au: "anz",
  australia: "anz",
  nz: "anz",
  uk: "uk",
  ie: "uk",
  ireland: "uk",
  free: "uk",
  zero: "uk",
};

const CRYPTO_EACH = 0.01;
const CFD_EACH = 0.0015;
const CFD_PENNY_EACH = 0.02;
const CFD_PENNY_BELOW = 3;
const UK_STAMP = 0.005;
const FX_IF_CONVERTED = 0.0075;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const ASIA_ME = new Set(["ASX", "HKEX", "DFM", "ADX", "TSE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

function isTracker(type) {
  return /^(ETF|ETC|ETN)$/i.test(type || "");
}

export function feeMarketOf(row, mic) {
  const type = String(row?.type || "").toUpperCase();
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (type === "CRYPTO" || code === "CRYPTO") return "crypto";
  if (row?.cfd) return "cfd";
  if (isTracker(type)) return "etf";
  if (ASIA_ME.has(code) || ASIA_ME.has(m)) return "asiaMe";
  return "other";
}

export function ticketEach(plan, market) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked) return null;
  if (market === "asiaMe") return picked.asiaMe;
  if (market === "other") return picked.other;
  return 0;
}

function rateEach(market) {
  if (market === "crypto") return CRYPTO_EACH;
  if (market === "cfd") return CFD_EACH;
  return 0;
}

function remarkOf({ market, plan, american } = {}) {
  const lines = [];
  if (plan?.id === "uk") lines.push("UK / Ireland: no stock ticket.");
  if (plan?.id === "anz") lines.push("Australia / New Zealand: 2 $ every stock exchange.");
  lines.push("FX 0.75% if converted.");
  if (market === "cfd" && american) {
    lines.push(`US CFD at or under ${CFD_PENNY_BELOW} $: ${CFD_PENNY_EACH} $/share each way.`);
  }
  return lines.join("\n");
}

function stampOf({ listing, tax }) {
  const rates = taxRates(tax);
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "t212" };
  const stock = String(listing.type || "").toUpperCase() === "STOCK";
  if (stock && listing.mic === "XLON") {
    return { pct: UK_STAMP, rates: { stamp: UK_STAMP }, source: "etoro" };
  }
  return { pct: 0, rates: {}, source: null };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) =>
      !(String(r.type || "").toUpperCase() === "CRYPTO" && r.cfd) &&
      (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked)
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      if (wantUnsourced && m.unsourced) return m.unsourced.name === wantUnsourced.name;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.query || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function exactCost({ amount, market, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  if (!picked) return { commission: null, currency: QUOTE };
  const ticket = ticketEach(picked, market);
  const rate = rateEach(market);
  const notional = amount != null && Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const each = (ticket || 0) + notional * rate;
  return {
    commission: Number((each * 2).toPrecision(6)),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: "USD" },
    plan: picked.id,
    market,
  };
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    plan: picked?.id ?? plan,
    etf,
    place,
    currency,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (standard|anz|uk)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue eToro n'existe pas encore : lancer `node etoro/etoro_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue eToro` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez eToro`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    query: m.row.query || null,
    cfd: Boolean(m.row.cfd),
  };

  const market = feeMarketOf(m.row, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic);
  const tax = taxesOf(listing.isin);
  const stamp = stampOf({ listing, tax });
  const commPct = rateEach(market) * 2;
  const knownPct = commPct + stamp.pct;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const bookUsd = mkt.b;
  const ticket = ticketEach(picked, market) || 0;
  const c = ticket * 2;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(bookUsd, 6),
    c: Number(Number(c).toPrecision(6)),
    floor: null,
    listing,
    feeMarket: market,
    remark: remarkOf({ market, plan: picked, american }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(stamp.rates).length ? stamp.rates : null,
      commission: commPct || null,
      ticket: c || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème eToro ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      kind: commPct ? "pct" : "flat",
      rate: commPct ? rateEach(market) : null,
      ticket: ticket || null,
      currency: "USD",
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    cap: null,
    threshold:
      market === "cfd" && american
        ? {
            b: CFD_PENNY_EACH * 2,
            a: 0,
            currency: QUOTE,
            below: CFD_PENNY_BELOW,
            belowCurrency: "USD",
            why: `CFD US à ${CFD_PENNY_BELOW} $ ou moins : ${CFD_PENNY_EACH} $/share par jambe à la place de ${CFD_EACH * 100} %`,
          }
        : null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `eToro ${picked.label}, palier ${market}, page lue le ${SCHEDULE.readOn}. ` +
      (market === "crypto"
        ? `Crypto ${CRYPTO_EACH * 100} % par jambe (Bronze / Silver / Gold). `
        : market === "cfd"
          ? `CFD ${CFD_EACH * 100} % par jambe, pas de ticket. `
          : market === "etf"
            ? `ETF / ETC sans commission. `
            : `Ticket ${ticket} $ par jambe (dans c). `) +
      `SEC / TAF hors de a (« no additional broker fees »). ` +
      `Change 0,75 % hors de a (portefeuille USD / local). Custody 0. ` +
      `Pas d'aller-retour réel dans ce dépôt. ` +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          defaultPlan: DEFAULT_PLAN,
          plans: PLANS,
          crypto: CRYPTO_EACH,
          cfd: CFD_EACH,
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node etoro_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=standard|anz|uk] [--json]\n" +
        "        node etoro_cost.mjs --schedule\n" +
        "  ex.   node etoro_cost.mjs AAPL\n" +
        "        node etoro_cost.mjs VUSA EURONEXT EUR\n" +
        "        node etoro_cost.mjs AAPL NASDAQ USD --plan=uk"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce qu'eToro propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `${l.cfd ? ", CFD" : ""}  [${picked?.label || out.plan}]\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : spread 605" : " : rien"})`);
  console.log(
    `c = ${out.c} $   (par ordre : ${out.c ? `${out.c / 2} $ × 2` : "pas de ticket"})`
  );
  if (out.remark) console.log(out.remark);
  if (out.why) console.log(out.why);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c : null;
    const billed = exactCost({ amount: amountUsd ?? amount, market: out.feeMarket, plan: out.plan });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null
            ? ` (${Number(billed.native.each).toPrecision(4)} ${billed.native.currency} × 2)`
            : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
