// What one round trip costs at Interactive Brokers Ireland: buy n shares at
// price p, sell them back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// Interactive Brokers Ireland Limited (IBIE). Catalogue from
// `interactivebrokers_scraping.mjs` on interactivebrokers.ie. Default card is
// IBKR Pro Fixed + IB SmartRouting — the all-in column (no venue
// pass-through). `--plan=tiered` is the first published bucket only, and
// exchange / clearing / rebate lines stay out (the page does not give one
// number for SMART).
//
// US / Canada are cents per share with a minimum. The minimum is the whole
// bill under 200 US shares / 100 CAD shares, so the ¢/share stays out of `b`
// (same as CapTrader). Europe and Asia are % of notional: that % × 2 sits in
// `a`, the ticket is a floor (`min fees`, `c` = 0). Western Europe's
// "€3 / £3 per trade" is that floor: 0.05 % binds above €6 000 / £6 000.
// Hungary HUF is 0.55 % buy + 0.10 % sell. Korea / Taiwan / Malaysia /
// Brazil print Tiered only — that first bucket is what this file uses.
//
// US-domiciled ETFs (`nonEuResident`) are not buyable for an EU retail
// account (PRIIPs). They answer `onlineBuy: false`. NTF reimbursement after
// 30 days is not this trip. Crypto is zerohash europe: 0.18 % , min 1.75 $,
// no tape. Conversion (0.08–0.20 bp on the FX page) stays out of `a`.
// Custody is free. VAT "may apply" with no rate — left out. SEC / TAF use
// the figures printed on the same US page (0.0000206 / 0.000195).
//
//   https://www.interactivebrokers.ie/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.ie/en/pricing/commissions-crypto-assets.php
//   https://www.interactivebrokers.ie/en/trading/products-etfs.php
//
//   node interactivebrokers/interactivebrokers_cost.mjs AAPL NASDAQ USD
//   node interactivebrokers/interactivebrokers_cost.mjs IWDA AEB EUR
//   node interactivebrokers/interactivebrokers_cost.mjs VWCE IBIS EUR --shares=1 --price=140
//   node interactivebrokers/interactivebrokers_cost.mjs BTC ZEROHASH USD
//   node interactivebrokers/interactivebrokers_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("interactivebrokers-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  stocks: "https://www.interactivebrokers.ie/en/pricing/commissions-stocks.php",
  crypto: "https://www.interactivebrokers.ie/en/pricing/commissions-crypto-assets.php",
  etfs: "https://www.interactivebrokers.ie/en/trading/products-etfs.php",
  readOn: "2026-09-11",
  entity: "Interactive Brokers Ireland Limited (IBIE)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const DEFAULT_PLAN = "fixed";

const WEST_MIN = { EUR: 3, GBP: 3, CHF: 5, USD: 4, DKK: 49, NOK: 49, SEK: 49 };
const WEST_TIERED_MIN = { EUR: 1.25, GBP: 1, CHF: 1.5, USD: 1.7, DKK: 10, NOK: 10, SEK: 10 };
const HK_MIN = { HKD: 18, USD: 2.25, CNH: 15, CNY: 15 };
const SG_MIN = { SGD: 2.5, USD: 2, GBP: 1.4, HKD: 14.5, EUR: 2 };

// Fixed SmartRouting, first published bucket. `roundTrip` is used when the
// two legs are not the same % (Hungary HUF).
const RULE = {
  us: { kind: "perShare", perShare: 0.005, min: 1, maxPct: 0.01, ccy: "USD", tiered: { perShare: 0.0035, min: 0.35 } },
  ca: { kind: "perShare", perShare: 0.01, min: 1, maxPct: 0.005, ccy: "CAD", tiered: { perShare: 0.008, min: 1 } },
  west: { kind: "pct", rate: 0.0005, minBy: WEST_MIN, fallback: { min: 3, ccy: "EUR" } },
  pt: { kind: "pct", rate: 0.0015, min: 6, ccy: "EUR" },
  pl: { kind: "pct", rate: 0.001, min: 15, ccy: "PLN" },
  baltic: { kind: "pct", rate: 0.002, min: 10, ccy: "EUR" },
  cz: { kind: "pct", rate: 0.0015, min: 70, ccy: "CZK" },
  ro: { kind: "pct", rate: 0.0028, min: 10, ccy: "RON" },
  si: { kind: "pct", rate: 0.0035, min: 3, ccy: "EUR" },
  hu: { kind: "pct", roundTrip: 0.0065, min: 200, ccy: "HUF" },
  jp: { kind: "pct", rate: 0.0008, min: 80, ccy: "JPY" },
  au: { kind: "pct", rate: 0.0008, min: 6, ccy: "AUD" },
  hk: { kind: "pct", rate: 0.0008, minBy: HK_MIN, fallback: { min: 18, ccy: "HKD" } },
  sg: { kind: "pct", rate: 0.0008, minBy: SG_MIN, fallback: { min: 2.5, ccy: "SGD" } },
  mx: { kind: "pct", rate: 0.001, min: 60, ccy: "MXN" },
  in: { kind: "pct", rate: 0.0001, min: 6, max: 20, ccy: "INR" },
  il: { kind: "pct", rate: 0.001, min: 15, ccy: "ILS" },
  sa: { kind: "pct", rate: 0.001, min: null, ccy: "SAR" },
  adx: { kind: "pct", rate: 0.001, min: 5, ccy: "AED" },
  dfm: { kind: "pct", rate: 0.0025, min: 5, ccy: "AED" },
  kr: { kind: "pct", rate: 0.0006, min: 4000, ccy: "KRW", tieredOnly: true },
  tw: { kind: "pct", rate: 0.0008, min: 80, ccy: "TWD", tieredOnly: true },
  my: { kind: "pct", rate: 0.0008, min: 12, ccy: "MYR", tieredOnly: true },
  br: { kind: "pct", rate: 0.0007, min: null, ccy: "BRL", tieredOnly: true },
  crypto: { kind: "pct", rate: 0.0018, min: 1.75, maxPct: 0.01, ccy: "USD" },
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

const dollars = (amount, currency) => {
  const ccy = currency === "CNH" ? "CNY" : currency;
  const v = toUsd(amount, ccy);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency === "CNH" ? "CNY" : currency),
});

const venueRow = (row) => ({
  ...row,
  exchange: TO_VENUES[row.exchange] || row.exchange,
});

function planOf(name) {
  const id = String(name || DEFAULT_PLAN).toLowerCase();
  if (id === "fixed" || id === "pro" || id === "smart") return "fixed";
  if (id === "tiered" || id === "tier") return "tiered";
  return null;
}

function boundOf(rule, currency, plan) {
  const ccy = String(currency || "").toUpperCase();
  if (plan === "tiered" && rule.tiered) {
    return { min: rule.tiered.min, ccy: rule.ccy, perShare: rule.tiered.perShare };
  }
  if (rule.minBy) {
    if (ccy && rule.minBy[ccy] != null) return { min: rule.minBy[ccy], ccy };
    return { min: rule.fallback.min, ccy: rule.fallback.ccy };
  }
  return { min: rule.min ?? null, ccy: rule.ccy, perShare: rule.perShare };
}

function commissionPct(rule) {
  if (rule.kind !== "pct") return 0;
  if (rule.roundTrip != null) return rule.roundTrip;
  return rule.rate * 2;
}

function remarkOf({ market, rule, bound, plan }) {
  if (market === "crypto") return "min fees $3.50. zerohash europe, no tape.";
  if (rule.tieredOnly) {
    const floor =
      bound.min != null
        ? `min fees ${bound.min * 2} ${bound.ccy}. `
        : "";
    return `${floor}IBKR publishes Tiered pricing only; this is the lowest volume band.`;
  }
  if (plan === "tiered") return "Tiered first bucket. Exchange / clearing extra, not in a/b/c.";
  if (bound.min == null) return "";
  const n = bound.min * 2;
  const ccy = bound.ccy;
  const amount =
    ccy === "USD" ? `$${n}` : ccy === "EUR" ? `€${n}` : ccy === "GBP" ? `£${n}` : `${n} ${ccy}`;
  return `min fees ${amount}.`;
}

export function feeMarketOf(exchange, mic, type, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (type === "CRYPTO" || /ZEROHASH|PAXOS/.test(code)) return "crypto";
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS|PINK)$/.test(code)) return "us";
  if (
    /^(TSE|TSX|VENTURE|VALUE|PURE|AEQLIT)$/.test(code) ||
    ["XTSE", "XTSX"].includes(m)
  ) {
    return "ca";
  }
  if (code === "KRX") return "kr";
  if (code === "TWSE" || code === "TPEX") return "tw";
  if (code === "BURSAMY") return "my";
  if (code === "B3") return "br";
  if (code === "NSE") return "in";
  if (code === "MEXI") return "mx";
  if (code === "TASE") return "il";
  if (code === "TADAWUL") return "sa";
  if (code === "ADX") return "adx";
  if (code === "DFM") return "dfm";
  if (code === "TSEJ" || m === "XJPX" || m === "XTKS") return "jp";
  if (code === "ASX" || m === "XASX") return "au";
  if (/^SEHK|CHINEXT/.test(code) || m === "XHKG") return "hk";
  if (code === "SGX" || m === "XSES") return "sg";
  if (code === "WSE" || m === "XWAR") return "pl";
  if (code === "BVL" || m === "XLIS") return "pt";
  if (/^N(TALLINN|RIGA|VILNIUS)$/.test(code)) return "baltic";
  if (code === "PRA") return "cz";
  if (code === "BVB") return "ro";
  if (code === "LJSE") return "si";
  if (code === "BUX") return currency === "HUF" ? "hu" : "west";
  if (
    /^(IBIS|IBIS2|GETTEX|GETTEX2|FWB|FWB2|SWB|SWB2|SBF|AEB|ENEXTBE|BVME|BVMEETF|EBS|LSE|LSEETF|LSEIOB1|SFB|OSE|OMXNO|CPH|VSE|BM|ISED)$/.test(code) ||
    ["XETR", "XMUN", "XFRA", "XSTU", "XPAR", "XAMS", "XBRU", "XMIL", "XSWX", "XLON", "XSTO", "XOSL", "XCSE", "XHEL", "XWBO", "XMAD", "XDUB"].includes(m)
  ) {
    return "west";
  }
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
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
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic, r.type, r.currency) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function commissionEach({ shares, amount, market, currency, plan = DEFAULT_PLAN }) {
  const rule = RULE[market];
  if (!rule) return null;
  const bound = boundOf(rule, currency, plan);
  if (rule.kind === "perShare") {
    const px = bound.perShare ?? rule.perShare;
    if (shares == null || !Number.isFinite(Number(shares))) return bound.min;
    let fee = px * Number(shares);
    if (bound.min != null) fee = Math.max(bound.min, fee);
    if (rule.maxPct != null && amount != null) fee = Math.min(fee, Number(amount) * rule.maxPct);
    return fee;
  }
  const rate = rule.roundTrip != null ? rule.roundTrip / 2 : rule.rate;
  if (amount == null || !Number.isFinite(Number(amount))) return bound.min;
  let fee = Number(amount) * rate;
  if (bound.min != null) fee = Math.max(bound.min, fee);
  if (rule.max != null) fee = Math.min(fee, rule.max);
  if (rule.maxPct != null) fee = Math.min(fee, Number(amount) * rule.maxPct);
  return fee;
}

export function exactCost({ shares, price, market, currency, plan = DEFAULT_PLAN }) {
  const rule = RULE[market];
  if (!rule) return { commission: null, currency: QUOTE };
  const bound = boundOf(rule, currency, plan);
  const amount = shares != null && price != null ? Number(shares) * Number(price) : null;
  const each = commissionEach({ shares, amount, market, currency, plan });
  if (each == null) return { commission: null, currency: QUOTE, rule };
  return {
    commission: dollars(each * 2, bound.ccy),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: bound.ccy },
    rule,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
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
    plan: picked ?? plan,
    etf,
    place,
    currency,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (fixed|tiered)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Interactive Brokers n'existe pas encore : lancer `node interactivebrokers/interactivebrokers_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Interactive Brokers` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Interactive Brokers`,
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

  const market = feeMarketOf(m.row.exchange, listing.mic, listing.type, listing.currency);
  const rule = market ? RULE[market] : null;
  if (!rule) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'est pas sur la grille IBIE Fixed SmartRouting`,
      tax: taxesOf(listing.isin),
      fx: fxNote(listing.currency),
    };
  }

  const usedPlan = rule.tieredOnly ? "tiered" : picked;
  const bound = boundOf(rule, listing.currency, usedPlan);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const commPct = commissionPct(rule);

  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, taxTotal + (american ? SEC_RATE : 0) + commPct);
  const bookUsd = mkt.b;
  const floorUsd = bound.min != null ? dollars(bound.min * 2, bound.ccy) : null;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(plus(bookUsd, american ? TAF_PER_SHARE : 0), 6),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    plan: usedPlan,
    onlineBuy: m.row.nonEuResident !== true,
    remark: remarkOf({ market, rule, bound, plan: usedPlan }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : market === "crypto"
              ? 0
              : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: commPct || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: market === "crypto" ? SCHEDULE.crypto : SCHEDULE.stocks,
    basis: `barème IBIE ${usedPlan} ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: rule.rate ?? null,
      roundTrip: rule.roundTrip ?? null,
      perShare: usedPlan === "tiered" ? bound.perShare ?? rule.perShare : rule.perShare ?? null,
      min: bound.min,
      max: rule.max ?? null,
      maxPct: rule.maxPct ?? null,
      currency: bound.ccy,
      eachWay: true,
    },
    ccy: QUOTE,
    cap: american
      ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" }
      : rule.max != null
        ? { commission: { amount: dollars(rule.max, bound.ccy), native: rule.max, currency: bound.ccy } }
        : null,
    threshold:
      listing.mic === "XLON"
        ? {
            c: dollars(2 * PTM.each, "GBP"),
            currency: QUOTE,
            above: PTM.above,
            aboveCurrency: "GBP",
            why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £`,
          }
        : null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `commission ${market} selon IBIE ${usedPlan} du ${SCHEDULE.readOn}. ` +
      (rule.kind === "perShare"
        ? `${(usedPlan === "tiered" ? bound.perShare : rule.perShare) * 100} ¢ / part, plancher ${bound.min} ${bound.ccy}. `
        : `${(commPct * 100).toFixed(2)} % A/R` +
          (bound.min != null ? `, plancher ${bound.min} ${bound.ccy} par jambe. ` : ". ")) +
      (usedPlan === "tiered" && !rule.tieredOnly
        ? `Tiered : frais de place non recopiés. `
        : "") +
      `a = carnet + taxes` +
      (american ? ` + SEC` : "") +
      (commPct ? ` + ${(commPct * 100).toFixed(2)} % de courtage` : "") +
      `. Ticket dans le plancher, b = ` +
      (american ? `605 + TAF` : `0`) +
      `, c = 0. ` +
      (leaf || market === "crypto" ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
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
      "usage : node interactivebrokers_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=fixed|tiered] [--json]\n" +
        "        node interactivebrokers_cost.mjs --schedule\n" +
        "  ex.   node interactivebrokers_cost.mjs AAPL NASDAQ USD\n" +
        "        node interactivebrokers_cost.mjs IWDA AEB EUR\n" +
        "        node interactivebrokers_cost.mjs VWCE IBIS EUR --shares=1 --price=140"
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
      console.log(`\nce qu'Interactive Brokers propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  if (out.onlineBuy === false) console.log(`achat en ligne : non (PRIIPs / non-EU resident)`);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.why) console.log(`  ${out.why}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency === "CNH" ? "CNY" : l.currency);
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c : 0;
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({
      shares: n,
      price: p,
      market: out.feeMarket,
      currency: l.currency,
      plan: out.plan,
    });
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
