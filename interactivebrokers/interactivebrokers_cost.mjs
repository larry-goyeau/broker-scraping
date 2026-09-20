// What one round trip costs at Interactive Brokers Ireland: buy n shares at
// price p (or put `amount` into a coin), sell them back at once, in dollars.
//
// The affine triple hid every printed floor. America's $1, Europe's €3 / £3,
// Canada's CAD 1, crypto's $1.75, Hungary's HUF 200 and India's INR 6 sat in
// `min fees` / `c` = 0, so a ten-share AAPL trip was missing $2 and a VWCE
// trip €6. The US 1 % cap (note 6: the cap wins when it is under the min),
// TAF's $9.79 ceiling and PTM's £1.50 above £10 000 lived only in fields the
// page never read. Hungary was billed 0.65 % both ways instead of 0.55 % buy
// / 0.10 % sell. `roundTrip` is given the size and charges what is charged.
//
// Interactive Brokers Ireland Limited (IBIE). Catalogue from
// `interactivebrokers_scraping.mjs` on interactivebrokers.ie — 80 321 lines
// (23 332 ETF, 56 695 stocks, 167 ETC, 78 ETN, 49 crypto; 12 495 US-domiciled
// ETFs flagged `nonEuResident`). Default card is IBKR Pro Fixed + IB
// SmartRouting — the all-in column (no venue pass-through). `--plan=tiered`
// is the first published bucket only; exchange / clearing / rebate lines stay
// out (the page does not give one number for SMART). Korea / Taiwan /
// Malaysia / Brazil print Tiered only — that first bucket is what this file
// uses even on the default plan.
//
// Tables re-read 2026-09-16 from the IE stocks and crypto pages — unchanged
// since the 11th. NTF reimbursement after 30 days, directed routing (0.10 %
// / higher mins), fractionals' $0.01 / 1 % special, the PEA 0.50 % cap and
// IBKR Lite are not this trip. A `nonEuResident` (no KID) line stays priced;
// `listingAccepts` hides it from an EEA nationality, not from an empty country
// box. Crypto is zerohash europe: 0.18 %, min $1.75, cap 1 % of trade
// value, no tape. Conversion (0.0008–0.002 % on the FX page) stays out: whether
// cash has to cross is a fact about the client's balances. Custody is free.
// VAT "may apply" with no rate — left out. NSCC $0.00020 and the NYSE /
// FINRA pass-throughs are Clearing / Pass-Through lines on the Tiered card;
// Fixed's third-party column is "Regulatory Fees" only, so they stay out.
//
// What is in the number: the commission each way at its floor and its cap
// (note 6: max then min, unless max < min); Hungary's 0.55 % buy up to
// HUF 4 444 444 then 0.10 %, and 0.10 % sell, min HUF 200; stamp / FTT from
// the tax map, never invented; the PTM levy of £1.50 above £10 000 on a UK
// share (they print the levy); current SEC and TAF on an American sale, TAF
// capped at $9.79; CAT $0.000003 a share both ways (they print it on the
// same US Regulatory Fees block); Canada's printed CAD 0.00011 / share cap
// CAD 3.30 on a CAD sale; Euronext's €0.75 per execution on an ETF (note 3
// on FR/NL/BE Fixed); the market spread, once. Crypto has no tape, so the
// book is 0 and not N/A.
//
//   https://www.interactivebrokers.ie/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.ie/en/pricing/commissions-crypto-assets.php
//   https://www.interactivebrokers.ie/en/trading/products-etfs.php
//
//   node interactivebrokers/interactivebrokers_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node interactivebrokers/interactivebrokers_cost.mjs IWDA AEB EUR --shares=10 --price=100
//   node interactivebrokers/interactivebrokers_cost.mjs VWCE IBIS EUR --shares=1 --price=140
//   node interactivebrokers/interactivebrokers_cost.mjs BTC ZEROHASH USD --amount=1000
//   node interactivebrokers/interactivebrokers_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("interactivebrokers-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  stocks: "https://www.interactivebrokers.ie/en/pricing/commissions-stocks.php",
  crypto: "https://www.interactivebrokers.ie/en/pricing/commissions-crypto-assets.php",
  etfs: "https://www.interactivebrokers.ie/en/trading/products-etfs.php",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-11",
  entity: "Interactive Brokers Ireland Limited (IBIE)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CAT_PER_SHARE = 0.000003;
const CA_SEC_PER_SHARE = 0.00011;
const CA_SEC_CAP = 3.3;
const PTM = { each: 1.5, ccy: "GBP", above: 10000 };
const EURONEXT_ETF = { each: 0.75, ccy: "EUR" };
const HU_BUY_BAND = 4444444;
const IN_BAND = 1_000_000;
const UK_REGISTERED = /^(GB|GG|JE|IM)/;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG", "MEMX"]);
const US_EX = /^(NASDAQ|NYSE|AMEX|ARCA|BATS|PINK|IEX|CBOE|MEMX)$/;
const EURONEXT_ETF_EX = /^(SBF|AEB|ENEXTBE)$/;
const DEFAULT_PLAN = "fixed";

const WEST_MIN = { EUR: 3, GBP: 3, CHF: 5, USD: 4, DKK: 49, NOK: 49, SEK: 49 };
const WEST_TIERED_MIN = { EUR: 1.25, GBP: 1, CHF: 1.5, USD: 1.7, DKK: 10, NOK: 10, SEK: 10 };
const HK_MIN = { HKD: 18, USD: 2.25, CNH: 15, CNY: 15 };
const SG_MIN = { SGD: 2.5, USD: 2, GBP: 1.4, HKD: 14.5, EUR: 2 };

// Fixed SmartRouting, first published bucket. Hungary Fixed is not the same
// % on both legs. `tiered` overlays the first volume band when asked.
const RULE = {
  us: { kind: "perShare", perShare: 0.005, min: 1, maxPct: 0.01, ccy: "USD", tiered: { perShare: 0.0035, min: 0.35 } },
  ca: { kind: "perShare", perShare: 0.01, min: 1, maxPct: 0.005, ccy: "CAD", tiered: { perShare: 0.008, min: 1 } },
  caUsd: { kind: "perShare", perShare: 0.008, min: 0.8, maxPct: 0.004, ccy: "USD", tiered: { perShare: 0.006, min: 0.8 } },
  west: {
    kind: "pct",
    rate: 0.0005,
    minBy: WEST_MIN,
    fallback: { min: 3, ccy: "EUR" },
    tiered: { rate: 0.0005, minBy: WEST_TIERED_MIN, fallback: { min: 1.25, ccy: "EUR" } },
  },
  pt: { kind: "pct", rate: 0.0015, min: 6, ccy: "EUR", tiered: { rate: 0.0005, min: 1.25, ccy: "EUR" } },
  pl: { kind: "pct", rate: 0.001, min: 15, ccy: "PLN", tiered: { rate: 0.0005, min: 5, ccy: "PLN" } },
  baltic: { kind: "pct", rate: 0.002, min: 10, ccy: "EUR", tiered: { rate: 0.0005, min: 1.25, ccy: "EUR" } },
  cz: { kind: "pct", rate: 0.0015, min: 70, ccy: "CZK" },
  ro: { kind: "pct", rate: 0.0028, min: 10, ccy: "RON" },
  si: { kind: "pct", rate: 0.0035, min: 3, ccy: "EUR" },
  hu: {
    kind: "pct",
    buy: 0.0055,
    sell: 0.001,
    buyBand: HU_BUY_BAND,
    min: 200,
    ccy: "HUF",
    tiered: { rate: 0.0005, min: 200, ccy: "HUF" },
  },
  seEur: { kind: "pct", rate: 0.001, min: 4, ccy: "EUR", tiered: { rate: 0.0005, min: 1.25, ccy: "EUR" } },
  jp: { kind: "pct", rate: 0.0008, min: 80, ccy: "JPY", tiered: { rate: 0.0005, min: 80, ccy: "JPY" } },
  au: { kind: "pct", rate: 0.0008, min: 6, ccy: "AUD", tiered: { rate: 0.0008, min: 5, ccy: "AUD" } },
  hk: {
    kind: "pct",
    rate: 0.0008,
    minBy: HK_MIN,
    fallback: { min: 18, ccy: "HKD" },
    tiered: { rate: 0.0005, minBy: HK_MIN, fallback: { min: 18, ccy: "HKD" } },
  },
  sg: { kind: "pct", rate: 0.0008, minBy: SG_MIN, fallback: { min: 2.5, ccy: "SGD" } },
  mx: { kind: "pct", rate: 0.001, min: 60, ccy: "MXN" },
  in: { kind: "pct", rate: 0.0001, min: 6, max: 20, above: IN_BAND, aboveRate: 0.0002, ccy: "INR" },
  il: { kind: "pct", rate: 0.001, min: 15, ccy: "ILS", tiered: { rate: 0.0005, min: 5.25, ccy: "ILS" } },
  sa: { kind: "pct", rate: 0.001, min: null, ccy: "SAR", tiered: { rate: 0.0005, min: null, ccy: "SAR" } },
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
  HEX: "XHEL",
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
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = String(fxCcy(from) || "").toUpperCase();
  const b = String(fxCcy(to) || "").toUpperCase();
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}
const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(fxCcy(currency)) });
const venueRow = (row) => ({ ...row, exchange: TO_VENUES[row.exchange] || row.exchange });
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const isEtf = (listing) => String(listing?.type || "").toUpperCase() === "ETF";
const settleOf = (currency) => (String(currency || "").toUpperCase() === "GBX" ? "GBP" : currency);
const nativeAmount = (shares, price, currency) => {
  if (shares == null || price == null) return null;
  const amount = Number(shares) * Number(price);
  if (!Number.isFinite(amount)) return null;
  return String(currency || "").toUpperCase() === "GBX" ? amount / 100 : amount;
};

export function planOf(name) {
  const id = String(name || DEFAULT_PLAN).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (id === "fixed" || id === "pro" || id === "smart") return "fixed";
  if (id === "tiered" || id === "tier") return "tiered";
  return null;
}

function boundOf(rule, currency) {
  const ccy = String(currency || "").toUpperCase();
  if (rule.minBy) {
    if (ccy && rule.minBy[ccy] != null) return { min: rule.minBy[ccy], ccy };
    return { min: rule.fallback.min, ccy: rule.fallback.ccy };
  }
  return { min: rule.min ?? null, ccy: rule.ccy, perShare: rule.perShare };
}

export function resolveRule(market, currency, plan = DEFAULT_PLAN) {
  const base = RULE[market];
  if (!base) return null;
  const asked = planOf(plan) || DEFAULT_PLAN;
  const useTiered = base.tieredOnly || (asked === "tiered" && base.tiered);
  const rule = useTiered && base.tiered ? { ...base, ...base.tiered } : { ...base };
  const usedPlan = base.tieredOnly || useTiered ? "tiered" : "fixed";
  return { rule, bound: boundOf(rule, currency), usedPlan };
}

function remarkOf({ market, rule, usedPlan, currency } = {}) {
  const lines = [];
  if (market === "crypto") lines.push("zerohash europe, no tape.");
  if (rule?.tieredOnly) {
    lines.push("IBKR publishes Tiered pricing only; this is the lowest volume band.");
  } else if (usedPlan === "tiered") {
    lines.push("Tiered first bucket. Exchange / clearing extra.");
  }
  lines.push(fxRemark("0.0008–0.002", currency));
  return lines.join("\n");
}

export function feeMarketOf(exchange, mic, type, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (type === "CRYPTO" || /ZEROHASH|PAXOS/.test(code)) return "crypto";
  if (US_MICS.has(m) || US_EX.test(code)) return "us";
  if (/^(TSE|TSX|VENTURE|PURE|AEQLIT)$/.test(code) || ["XTSE", "XTSX"].includes(m)) {
    return ccy === "USD" ? "caUsd" : "ca";
  }
  if (code === "VALUE") return ccy === "CAD" ? "ca" : null;
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
  if (code === "BUX") return ccy === "HUF" ? "hu" : "west";
  if ((code === "SFB" || m === "XSTO") && ccy === "EUR") return "seEur";
  if (
    /^(IBIS|IBIS2|GETTEX|GETTEX2|FWB|FWB2|SWB|SWB2|SBF|AEB|ENEXTBE|BVME|BVMEETF|EBS|LSE|LSEETF|LSEIOB1|SFB|OSE|OMXNO|OSL|CPH|VSE|BM|ISED|HEX|AQSE)$/.test(
      code
    ) ||
    [
      "XETR",
      "XMUN",
      "XFRA",
      "XSTU",
      "XPAR",
      "XAMS",
      "XBRU",
      "XMIL",
      "XSWX",
      "XLON",
      "XSTO",
      "XOSL",
      "XCSE",
      "XHEL",
      "XWBO",
      "XMAD",
      "XDUB",
      "AQSE",
    ].includes(m)
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
    .filter((hit) => {
      if (!wantPlace) return true;
      if (wantVenue && hit.venue) return hit.venue.mic === wantVenue.mic;
      return loose(hit.row.exchange) === wantPlace || loose(hit.row.exchange).includes(wantPlace);
    })
    .filter((hit) => !wantCurrency || String(hit.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

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
    const hasBook = book.leaf?.bp != null || book.leaf?.perShare != null || type === "CRYPTO";
    if (hasBook) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (hasBook) mk.withBook += 1;
  }
  return out;
}

/**
 * One side's commission, at the floor and under the cap. Note 6: when the
 * printed maximum is under the minimum, the maximum is the whole bill.
 */
export function commissionSide({ shares, amount, market, currency, plan = DEFAULT_PLAN, side = "buy" }) {
  const resolved = resolveRule(market, currency, plan);
  if (!resolved) return null;
  const { rule, bound, usedPlan } = resolved;

  if (rule.kind === "perShare") {
    if (shares == null || !Number.isFinite(Number(shares))) return null;
    const px = bound.perShare ?? rule.perShare;
    const raw = px * Number(shares);
    const ceiling = rule.maxPct != null && amount != null ? Number(amount) * rule.maxPct : null;
    let charged;
    if (ceiling != null && bound.min != null && ceiling < bound.min) charged = ceiling;
    else {
      charged = ceiling != null ? Math.min(raw, ceiling) : raw;
      if (bound.min != null) charged = Math.max(bound.min, charged);
    }
    return {
      raw,
      charged,
      floored: bound.min != null && charged === bound.min && raw < bound.min,
      capped: ceiling != null && charged === ceiling,
      currency: bound.ccy,
      usedPlan,
    };
  }

  if (amount == null || !Number.isFinite(Number(amount))) return null;
  let raw;
  if (usedPlan === "fixed" && rule.buy != null) {
    if (side === "sell") raw = Number(amount) * rule.sell;
    else if (rule.buyBand != null && Number(amount) > rule.buyBand) {
      raw = rule.buyBand * rule.buy + (Number(amount) - rule.buyBand) * rule.sell;
    } else raw = Number(amount) * rule.buy;
  } else if (rule.above != null && Number(amount) > rule.above) {
    raw = rule.above * rule.rate + (Number(amount) - rule.above) * rule.aboveRate;
  } else {
    raw = Number(amount) * rule.rate;
  }

  const ceiling = rule.maxPct != null ? Number(amount) * rule.maxPct : null;
  let charged = raw;
  if (bound.min != null) charged = Math.max(bound.min, charged);
  if (rule.max != null) charged = Math.min(charged, rule.max);
  if (ceiling != null) {
    if (bound.min != null && ceiling < bound.min) charged = ceiling;
    else charged = Math.min(charged, ceiling);
  }
  return {
    raw,
    charged,
    floored: bound.min != null && raw < bound.min && !(ceiling != null && ceiling < bound.min),
    capped: (rule.max != null && charged === rule.max) || (ceiling != null && charged === ceiling),
    currency: bound.ccy,
    usedPlan,
  };
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling them straight back. `brokerFees` is the IBIE ticket.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
  const picked = planOf(plan);
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "", plan: picked ?? plan };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (fixed|tiered)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Interactive Brokers n'existe pas encore : lancer `node interactivebrokers/interactivebrokers_scraping.mjs`",
    };
  }

  let { named, matches } = findListing({ etf, place, currency });
  if ((amount != null || /ZEROHASH|PAXOS/.test(loose(place))) && matches.length > 1) {
    const coins = matches.filter((hit) => String(hit.row.type || "").toUpperCase() === "CRYPTO");
    if (coins.length) matches = coins;
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Interactive Brokers` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Interactive Brokers`,
      alternatives: listAlternatives(named),
    };
  }

  const hit = matches[0];
  const book = spreadLeaf(spreads, {
    isin: hit.row.isin,
    mic: hit.venue?.mic ?? null,
    currency: hit.row.currency,
    unsourced: hit.unsourced,
    broker: "interactivebrokers",
    ticker: hit.row.ticker,
  });
  const listing = {
    isin: String(hit.row.isin || "").toUpperCase() || null,
    ticker: hit.row.ticker || null,
    name: hit.row.name || null,
    type: hit.row.type || null,
    mic: book.mic ?? hit.venue?.mic ?? null,
    exchange: hit.venue?.name ?? hit.unsourced?.name ?? hit.row.exchange ?? null,
    currency: String(hit.row.currency || "").toUpperCase() || (String(hit.row.type || "").toUpperCase() === "CRYPTO" ? "USD" : ""),
    brokerExchange: hit.row.exchange || null,
    query: hit.row.query || null,
  };

  const market = feeMarketOf(hit.row.exchange, listing.mic, listing.type, listing.currency);
  const resolved = market ? resolveRule(market, listing.currency, picked) : null;
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const american = market === "us";
  const canadian = market === "ca";
  const crypto = market === "crypto";

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    plan: resolved?.usedPlan ?? picked,
    bp: marketBp,
    perShare: marketPerShare,
    url: crypto ? SCHEDULE.crypto : SCHEDULE.stocks,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf({ market, rule: resolved?.rule, usedPlan: resolved?.usedPlan, currency: listing.currency }),
  };

  if (!resolved) {
    return {
      ...shared,
      basis: `aucun palier publié pour ${listing.brokerExchange || listing.exchange || "cette place"} chez IBIE`,
      why:
        `${listing.brokerExchange || listing.exchange || "cette place"} n'est pas sur la grille IBIE Fixed SmartRouting ` +
        `du ${SCHEDULE.readOn}`,
      confidence: `place hors carte, lue le ${SCHEDULE.readOn} : la commission est N/A plutôt qu'un voisin inventé`,
    };
  }

  const { rule, bound, usedPlan } = resolved;
  const basis =
    `barème IBIE ${usedPlan} ${market}, lu le ${SCHEDULE.readOn}` +
    (rule.kind === "perShare"
      ? ` : ${bound.perShare ?? rule.perShare} ${bound.ccy} / part, plancher ${bound.min} ${bound.ccy}` +
        (rule.maxPct != null ? `, plafond ${(100 * rule.maxPct).toFixed(1)} %` : "")
      : rule.buy != null && usedPlan === "fixed"
        ? ` : ${(100 * rule.buy).toFixed(2)} % achat / ${(100 * rule.sell).toFixed(2)} % vente, plancher ${bound.min} ${bound.ccy}`
        : ` : ${(100 * rule.rate).toFixed(2)} % par sens` +
          (bound.min != null ? `, plancher ${bound.min} ${bound.ccy}` : "") +
          (rule.max != null ? `, plafond ${rule.max} ${bound.ccy}` : "") +
          (rule.maxPct != null ? `, plafond ${(100 * rule.maxPct).toFixed(0)} %` : ""));

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = n > 0 && p > 0 ? nativeAmount(n, p, listing.currency) : crypto && cash > 0 ? cash : null;

  if (notional == null) {
    return {
      ...shared,
      basis,
      why: crypto
        ? "aucun montant pour cette ligne"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        market,
        rule,
        bound,
        usedPlan,
        listing,
        marketBp,
        marketPerShare,
        unsourced: hit.unsourced,
        taxPct,
      }),
    };
  }

  const settle = settleOf(listing.currency) || (crypto ? "USD" : listing.currency);
  const notionalUsd = dollars(notional, settle);
  const notionalInRule = convert(notional, settle, bound.ccy);
  const bookUsd = crypto
    ? 0
    : marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null && n > 0
        ? marketPerShare * n
        : null;

  const buy = commissionSide({
    shares: n > 0 ? n : null,
    amount: notionalInRule,
    market,
    currency: listing.currency,
    plan: usedPlan,
    side: "buy",
  });
  const sell = commissionSide({
    shares: n > 0 ? n : null,
    amount: notionalInRule,
    market,
    currency: listing.currency,
    plan: usedPlan,
    side: "sell",
  });
  const buyUsd = buy ? dollars(buy.charged, buy.currency) : null;
  const sellUsd = sell ? dollars(sell.charged, sell.currency) : null;
  const brokerFees = plus(buyUsd, sellUsd);

  const stampUsd = crypto || notionalUsd == null ? (crypto ? 0 : null) : notionalUsd * taxPct;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american && n > 0 ? Math.min(TAF_PER_SHARE * n, TAF_CAP) : american ? null : 0;
  const catUsd = american && n > 0 ? 2 * CAT_PER_SHARE * n : american ? null : 0;
  const caSecUsd = canadian && n > 0 ? dollars(Math.min(CA_SEC_PER_SHARE * n, CA_SEC_CAP), "CAD") : 0;

  const euronextNative =
    usedPlan === "fixed" && isEtf(listing) && EURONEXT_ETF_EX.test(loose(listing.brokerExchange))
      ? 2 * EURONEXT_ETF.each
      : 0;
  const euronextUsd = euronextNative ? dollars(euronextNative, EURONEXT_ETF.ccy) : 0;

  const notionalGbp = convert(notional, settle, PTM.ccy);
  const ptmDue =
    crypto || !isStock(listing) || !UK_REGISTERED.test(listing.isin || "")
      ? false
      : notionalGbp == null
        ? null
        : notionalGbp > PTM.above;
  const ptmUsd = ptmDue === false ? 0 : ptmDue === null ? null : dollars(2 * PTM.each, PTM.ccy);

  const usd = plus(bookUsd, brokerFees, stampUsd, secUsd, tafUsd, catUsd, caSecUsd, euronextUsd, ptmUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${hit.unsourced?.name || listing.exchange} : ` +
            `${hit.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: {
      shares: n > 0 ? n : null,
      price: p > 0 ? p : null,
      amount: crypto && cash > 0 ? cash : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency || (crypto ? "USD" : ""),
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy
        ? {
            charged: finite(buy.charged, 6),
            raw: finite(buy.raw, 6),
            floored: buy.floored,
            capped: buy.capped,
            currency: buy.currency,
          }
        : null,
      taxes: finite(stampUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell
        ? {
            charged: finite(sell.charged, 6),
            raw: finite(sell.raw, 6),
            floored: sell.floored,
            capped: sell.capped,
            currency: sell.currency,
          }
        : null,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      cat: finite(catUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(stampUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd, catUsd, caSecUsd, euronextUsd, ptmUsd), 6),
    },
    commission: {
      rate: rule.rate ?? null,
      buy: rule.buy ?? null,
      sell: rule.sell ?? null,
      perShare: bound.perShare ?? rule.perShare ?? null,
      min: bound.min,
      max: rule.max ?? null,
      maxPct: rule.maxPct ?? null,
      currency: bound.ccy,
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({
      market,
      rule,
      bound,
      usedPlan,
      buy,
      listing,
      marketBp,
      marketPerShare,
      unsourced: hit.unsourced,
      taxPct,
      american,
      canadian,
      crypto,
      ptmDue,
      euronext: euronextNative > 0,
      n: n > 0 ? n : null,
    }),
  };
}

function confidenceOf({
  market,
  rule,
  bound,
  usedPlan,
  buy,
  listing,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  american,
  canadian,
  crypto,
  ptmDue,
  euronext,
  n,
}) {
  const said = [];
  said.push(
    `commission IBIE ${usedPlan}, palier ${market}, lue le ${SCHEDULE.readOn} (inchangée depuis le ${SCHEDULE.previouslyRead}), ` +
      `facturée par sens et convertie en dollars au mid BCE du ${FX_AS_OF}`
  );
  if (buy) {
    said.push(
      buy.capped
        ? `plafonnée : ${Number(buy.charged).toPrecision(4)} ${bound.ccy} à l'achat`
        : buy.floored
          ? `au plancher : le ticket de ${bound.min} ${bound.ccy} est toute la commission, ` +
            `le calcul au barème n'en donnerait que ${Number(buy.raw).toPrecision(3)}`
          : `au-dessus du plancher : ${Number(buy.charged).toPrecision(4)} ${bound.ccy} à l'achat`
    );
  }
  if (rule.kind === "perShare" && n != null && bound.min != null && bound.perShare) {
    const cliff = bound.min / bound.perShare;
    if (n >= cliff) {
      said.push(
        `au-delà de ${Math.round(cliff)} parts la commission cesse d'être le ticket ` +
          `et devient ${bound.perShare} ${bound.ccy} la part`
      );
    }
  }
  if (crypto) said.push("zerohash europe, pas de carnet : le livre est 0 et non N/A");
  else if (marketBp != null) said.push(`carnet publié ${Number(marketBp).toPrecision(4)} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet 605 ${marketPerShare} $ la part, aller-retour`);
  else said.push(`aucun carnet : ${unsourced?.why || "place sans source de spread"} — le total est N/A et non un total sans marché`);

  if (taxPct) said.push(`taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`);
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant, TAF FINRA ${TAF_PER_SHARE} la part (plafond ${TAF_CAP} $), ` +
        `CAT ${CAT_PER_SHARE} la part les deux sens (imprimée sur la même page)`
    );
  }
  if (canadian) {
    said.push(`vente canadienne CAD : droit imprimé ${CA_SEC_PER_SHARE} $CA la part, plafond ${CA_SEC_CAP} $CA`);
  }
  if (euronext) {
    said.push(`Euronext ETF : ${EURONEXT_ETF.each} € par exécution (note 3 FR/NL/BE), les deux sens`);
  }
  if (ptmDue === null) said.push(`prélèvement PTM indécidable : le montant n'a pas pu être converti en livres`);
  else if (ptmDue) said.push(`prélèvement PTM de ${PTM.each} £ par sens, le montant dépassant ${PTM.above} £`);

  if (usedPlan === "tiered" && !rule.tieredOnly) {
    said.push("Tiered : frais de place / compensation non recopiés, premier palier seulement");
  }
  said.push(
    `hors total : la conversion (0,0008–0,002 %), qui dépend de la trésorerie. ` +
      `TVA « may apply » sans taux. NSCC et pass-through NYSE / FINRA : carte Tiered, pas Fixed. ` +
      `Routage direct, NTF, fractionnaires et plafond PEA hors de ce trajet. Garde 0`
  );
  return said.join(" ; ");
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
      "usage : node interactivebrokers_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd] [--plan=fixed|tiered] [--json]\n" +
        "        node interactivebrokers_cost.mjs --schedule\n" +
        "  ex.   node interactivebrokers_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node interactivebrokers_cost.mjs IWDA AEB EUR --shares=10 --price=100\n" +
        "        node interactivebrokers_cost.mjs VWCE IBIS EUR --shares=1 --price=140\n" +
        "        node interactivebrokers_cost.mjs BTC ZEROHASH USD --amount=1000"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce qu'Interactive Brokers propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.plan} / ${out.feeMarket}]\n`
  );

  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : t.amount ? `${t.amount} ${t.currency} = ` : ""}` +
        `${Number(t.notional).toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.onlineBuy === false) console.log(`achat en ligne   : non (PRIIPs / non-EU resident)`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.why && out.usd == null) console.log(`  ${out.why}`);
  if (out.url) console.log(`\n${out.url}`);
}
