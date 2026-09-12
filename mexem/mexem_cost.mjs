// What one round trip costs at Mexem: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// MEXEM Ltd (CY, CySEC 325/17) is an introducing broker onto Interactive
// Brokers LLC — the page says it is not part of the IBKR group. The catalogue
// is the IBKR book (`mexem_scraping.mjs`): ETFs / ETC / ETN today, no stocks
// and no crypto. Custody is not on the Stocks / ETFs card. Cash is not
// converted automatically, so FX stays out of `a`. Two commission-free ETF
// buys a month are a promotion, not this trip.
//
// The published card is by denominated currency, read 2026-09-11 (page
// updated 22 July 2026). Europe's % × 2 sits in `a`. The USD 0.005 $ and
// CAD 0.01 $ stay out of `b` (under 200 shares the minimum is the whole
// bill). The ticket is a floor (`min fees`, `c` = 0). `exactCost` answers
// the real step, including the US 2 % cap and the Canadian 1 % cap.
//
//   USD     0.005 $/share, min 1 $, max 2 %
//   CAD     0.01 $/share,  min 2 CAD, max 1 %
//   EUR     0.06 %, min 1 €     (Madrid BM: same %, min 3 €)
//   DKK     0.06 %, min 10
//   GBP     0.08 %, min 2.5
//   HUF     0.08 %, min 500
//   NOK     0.08 %, min 20
//   CHF     0.10 %, min 7.5
//   ILS     0.10 %, min 15
//   PLN     0.10 %, min 20
//   AUD     0.12 %, min 8
//   HKD     0.12 %, min 20
//   JPY     0.12 %, min 200     (printed twice, same figures)
//   SEK     0.12 %, min 20
//   SGD     0.12 %, min 4
//   CNH     0.15 %, min 25
//   MXN     0.15 %, min 75
//
// TWD / KRW / BRL / INR / SAR / MYR / AED / CZK / RON / CNY have no printed
// tier — the page says the platform price applies first, so this file
// answers N/A rather than inventing a neighbour's %. Exchange and
// regulatory costs "apply" on a list of European venues with no amounts;
// they stay out of `a`. SEC / TAF use the same current figures as the
// other files; Mexem's table does not reprint them. Stamp UK 0.5 % /
// Ireland 1 % is passed through — tax map first, else those printed rates
// on STOCK. PTM is £1 per order above £10 000 on UK / Channel / Isle of
// Man registered stocks.
//
// `nonEuResident` (no KID) is a residency fact: `listingAccepts` hides the
// row for an EEA visitor. It does not belong in `onlineBuy`, or a Taiwan
// ETF vanishes from the page when no country is selected.
//
// No live trip in this deposit.
//
//   https://www.mexem.com/fees
//
//   node mexem/mexem_cost.mjs IWDA AEB EUR
//   node mexem/mexem_cost.mjs IWDA LSEETF USD
//   node mexem/mexem_cost.mjs SPY ARCA USD
//   node mexem/mexem_cost.mjs BBVAI BM EUR
//   node mexem/mexem_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("mexem-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.mexem.com/fees",
  readOn: "2026-09-11",
  pageUpdated: "2026-07-22",
  entity: "MEXEM Ltd (CY), IB introducing broker",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1, currency: "GBP", above: 10000 };
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS"]);
const UK_REGISTERED = /^(GB|GG|JE|IM)/;

// rate of notional per side unless `perShare`. min / maxPct in `ccy`.
const RULE = {
  usd: { perShare: 0.005, min: 1, maxPct: 0.02, ccy: "USD" },
  ca: { perShare: 0.01, min: 2, maxPct: 0.01, ccy: "CAD" },
  madrid: { rate: 0.0006, min: 3, ccy: "EUR" },
  eur: { rate: 0.0006, min: 1, ccy: "EUR" },
  dkk: { rate: 0.0006, min: 10, ccy: "DKK" },
  gbp: { rate: 0.0008, min: 2.5, ccy: "GBP" },
  huf: { rate: 0.0008, min: 500, ccy: "HUF" },
  nok: { rate: 0.0008, min: 20, ccy: "NOK" },
  chf: { rate: 0.001, min: 7.5, ccy: "CHF" },
  ils: { rate: 0.001, min: 15, ccy: "ILS" },
  pln: { rate: 0.001, min: 20, ccy: "PLN" },
  aud: { rate: 0.0012, min: 8, ccy: "AUD" },
  hkd: { rate: 0.0012, min: 20, ccy: "HKD" },
  jpy: { rate: 0.0012, min: 200, ccy: "JPY" },
  sek: { rate: 0.0012, min: 20, ccy: "SEK" },
  sgd: { rate: 0.0012, min: 4, ccy: "SGD" },
  cnh: { rate: 0.0015, min: 25, ccy: "CNH" },
  mxn: { rate: 0.0015, min: 75, ccy: "MXN" },
};

const BY_CCY = {
  USD: "usd",
  CAD: "ca",
  EUR: "eur",
  DKK: "dkk",
  GBP: "gbp",
  GBX: "gbp",
  HUF: "huf",
  NOK: "nok",
  CHF: "chf",
  ILS: "ils",
  PLN: "pln",
  AUD: "aud",
  HKD: "hkd",
  JPY: "jpy",
  SEK: "sek",
  SGD: "sgd",
  CNH: "cnh",
  MXN: "mxn",
};

const TO_VENUES = {
  TSE: "TSX",
  TSEJ: "TSEJ",
  "BVME.ETF": "BVME",
  "ENEXT.BE": "XBRU",
  LSEIOB1: "LSE",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const fxCcy = (currency) => (String(currency || "").toUpperCase() === "CNH" ? "CNY" : currency);

const dollars = (amount, currency) => {
  const v = toUsd(amount, fxCcy(currency));
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(fxCcy(currency)),
});

const venueRow = (row) => ({
  ...row,
  exchange: TO_VENUES[row.exchange] || row.exchange,
});

const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";

const isAmerican = (exchange, mic) => US_MICS.has(String(mic || "").toUpperCase()) || US_EX.has(loose(exchange));

function remarkOf({ market } = {}) {
  const r = RULE[market];
  if (!r || r.min == null) return "";
  const n = r.min * 2;
  const ccy = r.ccy === "EUR" ? "€" : r.ccy === "USD" ? "$" : r.ccy === "GBP" ? "£" : r.ccy;
  const amount = r.ccy === "USD" || r.ccy === "EUR" || r.ccy === "GBP" ? `${n} ${ccy}` : `${n} ${r.ccy}`;
  return `min fees ${amount}.`;
}

export function feeMarketOf(exchange, mic, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (code === "BM" || m === "XMAD" || m === "XMCE") return "madrid";
  if (ccy === "CAD" || ((code === "TSE" || code === "TSX" || code === "VENTURE" || code === "AEQLIT" || m === "XTSE") && !ccy)) {
    return "ca";
  }
  return BY_CCY[ccy] || null;
}

function nativeAmount(shares, price, currency) {
  if (shares == null || price == null) return null;
  const amount = Number(shares) * Number(price);
  if (!Number.isFinite(amount)) return null;
  return String(currency || "").toUpperCase() === "GBX" ? amount / 100 : amount;
}

function stampOf({ listing, tax }) {
  const rates = taxRates(tax);
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "t212" };
  if (!isStock(listing)) return { pct: 0, rates: {}, source: null };
  const isin = String(listing.isin || "").toUpperCase();
  const mic = String(listing.mic || "").toUpperCase();
  if (isin.startsWith("IE") || mic === "XDUB" || mic === "XMSM") {
    return { pct: IE_STAMP, rates: { stamp: IE_STAMP }, source: "mexem" };
  }
  if (mic === "XLON" || isin.startsWith("GB")) {
    return { pct: UK_STAMP, rates: { stamp: UK_STAMP }, source: "mexem" };
  }
  return { pct: 0, rates: {}, source: null };
}

function thresholdOf(listing) {
  if (!isStock(listing) || !UK_REGISTERED.test(listing.isin || "")) return null;
  return {
    c: dollars(2 * PTM.each, "GBP"),
    currency: QUOTE,
    above: PTM.above,
    aboveCurrency: "GBP",
    why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £`,
  };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
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
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic, r.currency) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function commissionEach({ shares, amount, market }) {
  const rule = RULE[market];
  if (!rule || (rule.rate == null && rule.perShare == null)) return null;
  if (rule.perShare != null) {
    if (shares == null || !Number.isFinite(Number(shares))) return rule.min;
    let fee = rule.perShare * Number(shares);
    if (rule.min != null) fee = Math.max(rule.min, fee);
    if (rule.maxPct != null && amount != null) fee = Math.min(fee, Number(amount) * rule.maxPct);
    return fee;
  }
  if (amount == null || !Number.isFinite(Number(amount))) return rule.min;
  let fee = Number(amount) * rule.rate;
  if (rule.min != null) fee = Math.max(rule.min, fee);
  if (rule.max != null) fee = Math.min(fee, rule.max);
  return fee;
}

export function exactCost({ shares, price, market, currency }) {
  const rule = RULE[market];
  if (!rule) return { commission: null, currency: QUOTE };
  const amount = nativeAmount(shares, price, currency);
  const each = commissionEach({ shares, amount, market });
  if (each == null) return { commission: null, currency: QUOTE, rule };
  return {
    commission: dollars(each * 2, rule.ccy),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.ccy },
    rule,
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
      why: "le catalogue Mexem n'existe pas encore : lancer `node mexem/mexem_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Mexem` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Mexem`,
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
  };

  const market = feeMarketOf(m.row.exchange, listing.mic, listing.currency);
  const rule = RULE[market];
  if (!rule) {
    return {
      ...answer,
      a: null,
      b: null,
      c: null,
      listing,
      feeMarket: market,
      why: `${listing.currency || "cette devise"} n'a pas de palier publié chez Mexem`,
      tax: taxesOf(listing.isin),
      fx: fxNote(listing.currency),
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = isAmerican(m.row.exchange, listing.mic);
  const tax = taxesOf(listing.isin);
  const stamp = stampOf({ listing, tax });
  const commissionPct = rule.rate != null ? rule.rate * 2 : 0;
  const knownPct = stamp.pct + (american ? SEC_RATE : 0) + commissionPct;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const bookUsd = mkt.b;
  const floorUsd = rule.min != null ? dollars(rule.min * 2, rule.ccy) : null;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(plus(bookUsd, american ? TAF_PER_SHARE : 0), 6),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ market }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(stamp.rates).length ? stamp.rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: commissionPct || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Mexem ${market}, lu le ${SCHEDULE.readOn} (page mise à jour ${SCHEDULE.pageUpdated})`,
    tax,
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      min: rule.min,
      maxPct: rule.maxPct ?? null,
      currency: rule.ccy,
      eachWay: true,
    },
    ccy: QUOTE,
    cap: american
      ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" }
      : rule.maxPct != null
        ? { commission: { maxPct: rule.maxPct, currency: rule.ccy } }
        : null,
    threshold: thresholdOf(listing),
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `commission ${market} selon la carte Mexem du ${SCHEDULE.readOn} ` +
      `(page Stocks / ETFs ${SCHEDULE.pageUpdated}). ` +
      (rule.rate != null
        ? `${(rule.rate * 100).toFixed(2)} % par jambe, plancher ${rule.min} ${rule.ccy}. `
        : `${rule.perShare} ${rule.ccy} par part, plancher ${rule.min} ${rule.ccy}` +
          (rule.maxPct != null ? `, plafond ${(rule.maxPct * 100).toFixed(0)} %` : "") +
          `. `) +
      `a = carnet + taxes` +
      (american ? ` + SEC` : "") +
      (commissionPct ? ` + ${(commissionPct * 100).toFixed(2)} % de courtage` : "") +
      `. Ticket dans le plancher, b = ` +
      (american ? `605 + TAF` : `0`) +
      `, c = 0. ` +
      `Frais de place européens cités sans montant : hors de a. ` +
      `Pas d'aller-retour réel. ` +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rules: RULE, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node mexem_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node mexem_cost.mjs --schedule\n" +
        "  ex.   node mexem_cost.mjs IWDA AEB EUR\n" +
        "        node mexem_cost.mjs IWDA LSEETF USD\n" +
        "        node mexem_cost.mjs SPY ARCA USD --shares=1 --price=600"
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
      console.log(`\nce que Mexem propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.why && out.a == null && !RULE[out.feeMarket]) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    process.exit(0);
  }

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  const fx = out.fx?.listing ?? usdPer(fxCcy(l.currency));
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || out.why || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(nativeAmount(n, p, l.currency) ?? amount, fxCcy(l.currency));
    const extra = out.threshold && (nativeAmount(n, p, l.currency) ?? amount) >= out.threshold.above ? out.threshold.c : 0;
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({ shares: n, price: p, market: out.feeMarket, currency: l.currency });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null ? ` (${Number(billed.native.each).toPrecision(4)} ${billed.native.currency} × 2)` : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
