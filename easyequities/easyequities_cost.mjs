// What one round trip costs at EasyEquities: buy n shares at price p, sell
// them back at once (online, simple order).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The published ticket is a minimum of a
// % (1 c / 1 p), so it sits in the floor (`min fees`, `c` = 0).
//
// First World Trader (Pty) Ltd t/a EasyEquities (ZA). ZAR & TFSA profile of
// 12 February 2026; USD Nov 2024; AUD / GBP / EUR March 2026. Read 2026-09-10.
// Default is the online simple order on the wallet of the listing currency.
// Advanced (0.35 %), recurring (0.10 %), telephone and baskets are not this
// trip. TFSA prints the same stock tickets as the ZAR account.
//
//   every wallet     0.25 % brokerage, + 15 % VAT on costs
//   ZA               + 0.0795 % settlement + 0.00031 % IPL (both ways)
//                    + STT 0.25 % on a STOCK buy
//   US / AU / GB / EU
//                    + 0.31 % clearing both ways
//   US               + current SEC / TAF (their printed 0.00218 % / 0.0029 %
//                    are stale / a % stand-in; same figures as the other files)
//   GB / IE          stamp from the tax map, else their printed 0.50 % / 1 %
//                    on STOCK
//
// Cash wallets are ZAR / USD / AUD / GBP / EUR. EasyFX is a transfer between
// them (0.50 % + VAT, rate 0.70 % above WM/R on ZAR pairs), not a charge on
// every fill, so it stays out of `a`. Thrive 25 R / month is a holding cost.
// No live trip: the coefficients are the printed %.
//
//   https://www.easyequities.co.za/pricing
//   https://resources.easyequities.co.za/EasyEquities_CostProfile.pdf
//   https://resources.easyequities.co.za/EasyEquities_CostProfile_USTrading.pdf
//   https://resources.easyequities.co.za/EasyEquities_CostProfile_AUSTrading.pdf
//   https://resources.easyequities.co.za/EasyEquities_CostProfile_UKTrading.pdf
//   https://resources.easyequities.co.za/EasyEquities_CostProfile_EURTrading.pdf
//
//   node easyequities/easyequities_cost.mjs AAPL
//   node easyequities/easyequities_cost.mjs AAPL NASDAQ USD --shares=1 --price=320
//   node easyequities/easyequities_cost.mjs NPN JSE ZAR
//   node easyequities/easyequities_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("easyequities-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.easyequities.co.za/pricing",
  zar: "https://resources.easyequities.co.za/EasyEquities_CostProfile.pdf",
  usd: "https://resources.easyequities.co.za/EasyEquities_CostProfile_USTrading.pdf",
  aud: "https://resources.easyequities.co.za/EasyEquities_CostProfile_AUSTrading.pdf",
  gbp: "https://resources.easyequities.co.za/EasyEquities_CostProfile_UKTrading.pdf",
  eur: "https://resources.easyequities.co.za/EasyEquities_CostProfile_EURTrading.pdf",
  readOn: "2026-09-10",
  zarRevised: "2026-02-12",
  foreignRevised: "2026-03",
  entity: "EasyEquities (First World Trader, ZA)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const VAT = 0.15;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

const RULE = {
  za: {
    comm: 0.0025,
    extra: 0.000795,
    ipl: 0.0000031,
    stt: 0.0025,
    min: 0.01,
    minCcy: "ZAR",
  },
  us: { comm: 0.0025, extra: 0.0031, min: null, minCcy: "USD" },
  au: { comm: 0.0025, extra: 0.0031, min: null, minCcy: "AUD" },
  gbp: { comm: 0.0025, extra: 0.0031, stamp: 0.005, min: 0.01, minCcy: "GBP" },
  eur: { comm: 0.0025, extra: 0.0031, irish: 0.01, min: 0.01, minCcy: "EUR" },
};

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

const codeMarket = (query) => {
  const parts = String(query || "").toUpperCase().split(".");
  if (parts[0] !== "EQU" || !parts[1]) return null;
  return { ZA: "za", US: "us", AU: "au", GBP: "gbp", DE: "eur", NL: "eur" }[parts[1]] || null;
};

export function feeMarketOf(row, mic) {
  const fromCode = codeMarket(row?.query);
  if (fromCode) return fromCode;
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(row?.currency || "").toUpperCase();
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS)$/.test(code) || ccy === "USD") return "us";
  if (code === "JSE" || m === "XJSE" || ccy === "ZAR") return "za";
  if (code === "ASX" || m === "XASX" || ccy === "AUD") return "au";
  if (m === "XLON" || code === "LSE" || ccy === "GBP" || ccy === "GBX") return "gbp";
  if (["XETR", "XPAR", "XAMS", "XBRU", "XMIL", "XMSM"].includes(m) || ccy === "EUR") return "eur";
  return null;
}

function sidePct(rule) {
  return (rule.comm + (rule.extra || 0)) * (1 + VAT);
}

function minLabel(rule) {
  if (rule.min == null) return null;
  const n = rule.min * 2;
  if (rule.minCcy === "ZAR") return `${n} R`;
  if (rule.minCcy === "EUR") return `${n} €`;
  if (rule.minCcy === "GBP") return `${n} £`;
  return `${n} ${rule.minCcy}`;
}

function remarkOf({ rule }) {
  const lines = [];
  const min = minLabel(rule);
  if (min) lines.push(`min fees ${min}.`);
  lines.push("Thrive 25 R/month.");
  lines.push("EasyFX 0.5% if converted.");
  return lines.join("\n");
}


function stampOf({ market, listing, tax }) {
  const rates = taxRates(tax);
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "t212" };
  const stock = String(listing.type || "").toUpperCase() === "STOCK";
  if (market === "za" && stock && RULE.za.stt) {
    return { pct: RULE.za.stt, rates: { STT: RULE.za.stt }, source: "za" };
  }
  if (market === "gbp" && stock && listing.mic === "XLON") {
    return { pct: RULE.gbp.stamp, rates: { stamp: RULE.gbp.stamp }, source: "ee" };
  }
  if (market === "eur" && stock && (listing.mic === "XMSM" || listing.mic === "XDUB")) {
    return { pct: RULE.eur.irish, rates: { stamp: RULE.eur.irish }, source: "ee" };
  }
  return { pct: 0, rates: {}, source: null };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
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

export function commissionEach({ amount, market }) {
  const rule = RULE[market];
  if (!rule) return null;
  const rate = sidePct(rule);
  if (amount == null || !Number.isFinite(Number(amount))) {
    return rule.min == null ? null : rule.min;
  }
  const fee = Number(amount) * rate;
  return rule.min == null ? fee : Math.max(rule.min, fee);
}

export function exactCost({ amount, market }) {
  const rule = RULE[market];
  if (!rule) return { commission: null, currency: QUOTE };
  const each = commissionEach({ amount, market });
  return {
    commission: dollars(each * 2, rule.minCcy || "USD"),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.minCcy || "USD" },
    market,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    etf,
    place,
    currency,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue EasyEquities n'existe pas encore : lancer `node easyequities/easyequities.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue EasyEquities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez EasyEquities`,
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
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    query: m.row.query || null,
  };

  if (String(listing.type || "").toUpperCase() === "CRYPTO") {
    return { ...answer, listing, why: "pas de barème crypto publié sur les cost profiles" };
  }

  const market = feeMarketOf(m.row, listing.mic);
  const rule = RULE[market];
  if (!rule) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const stamp = stampOf({ market, listing, tax });
  const commPct = sidePct(rule) * 2;
  const iplPct = (rule.ipl || 0) * 2;
  const knownPct = commPct + iplPct + stamp.pct + (american ? SEC_RATE : 0);
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct;
  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const floorUsd = rule.min != null ? dollars(rule.min * 2, rule.minCcy) : null;

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number((bookUsd + (american ? TAF_PER_SHARE : 0)).toPrecision(6)),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ rule }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(stamp.rates).length ? stamp.rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: commPct,
      ipl: iplPct || null,
      vat: VAT,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème EasyEquities ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: rule.comm,
      extra: rule.extra || 0,
      vat: VAT,
      min: rule.min,
      currency: rule.minCcy,
      eachWay: true,
    },
    ccy: QUOTE,
    cap: american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : null,
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `EasyEquities ${market}, cost profile lu le ${SCHEDULE.readOn}. ` +
      `Courtage ${(rule.comm * 100).toFixed(2)} %` +
      (rule.extra ? ` + extra ${(rule.extra * 100).toFixed(4)} %` : "") +
      ` par jambe, TVA ${(VAT * 100).toFixed(0)} % dans a. ` +
      (american ? `SEC / TAF aux figures courantes, pas au 0,00218 % / 0,0029 % du PDF US. ` : "") +
      `EasyFX hors de a (virement entre wallets). ` +
      `Ticket dans le plancher, c = 0. Pas d'aller-retour réel dans ce dépôt. ` +
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
          vat: VAT,
          rules: Object.fromEntries(
            Object.entries(RULE).map(([k, v]) => [k, { ...v, sideInclVat: sidePct(v), roundTripInclVat: sidePct(v) * 2 }])
          ),
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
      "usage : node easyequities_cost.mjs <ticker|ISIN|EQU.US.AAPL> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node easyequities_cost.mjs --schedule\n" +
        "  ex.   node easyequities_cost.mjs AAPL\n" +
        "        node easyequities_cost.mjs AAPL NASDAQ USD --shares=1 --price=320\n" +
        "        node easyequities_cost.mjs NPN JSE ZAR"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce qu'EasyEquities propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.ipl) detail.push(`IPL ${out.parts.ipl}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
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
    const billed = exactCost({ amount, market: out.feeMarket });
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
