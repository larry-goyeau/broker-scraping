// What one round trip costs at WH SelfInvest: buy n shares at price p, sell
// them back at once, in dollars.
//
// The affine triple hid the floors. 0.09 % of a 2 300 $ Apple ticket is
// 2.07 $, but America is 0.01 $ a share with a 1.90 $ minimum, so ten
// shares pay 1.90 $ a side. `roundTrip` is given the size and charges
// what is charged.
//
// WH SELFINVEST S.A. (LU, CSSF), introducing broker onto Interactive
// Brokers. Catalogue `WHSelfInvest_scraping.mjs` — the IBKR book. Until
// that file has been run, this one answers that the book is missing.
// `nonEuResident` (no KID) stays priced; `listingAccepts` hides it from an
// EEA nationality, not from an empty country box.
// Options, futures, CFDs, turbos and telephone closes are not this trip.
//
// Tables re-read 2026-09-18 from
// https://www.whselfinvest.com/en-lu/investing-best-broker/all-exchanges-and-fees
// (same grid on the DE page). Marketing summaries disagree on the Swiss
// floor (9.95 vs 14 CHF) and the Xetra cap (99 vs 89 €); the exchange
// table is the one copied.
//
//   Xetra              0.09 %, min 3.90 €, cap 89 €
//   Frankfurt          0.09 %, min 3.90 €  (+ specialist on the page)
//   Stuttgart          0.09 %, min 5.90 €  (+ specialist on the page)
//   Chi-X / BATS / Tradegate / Turquoise DE
//                      0.09 %, min 1.90 €
//   USA listed         0.01 $/share, min 1.90 $, cap 1 %
//   USA OTC / Pink     p < 1 $ : 0.00003 $/share ; else 0.003 $/share
//                      + NSCC/DTC 0.0002 $/share, cap 0.5 %
//   Canada             0.01 CAD/share, min 1 CAD, cap 1 %
//   UK                 0.10 %, min 7 £
//   Switzerland        0.09 %, min 14 CHF
//   Netherlands        0.09 %, min 1.90 €
//   AT / BE / FR / ES / IT / SE / Vienna
//                      0.09 %, min 3.90 €
//   Norway             0.09 %, min 59 NOK
//   Mexico             0.20 %, min 70 MXN
//   Japan              0.09 %, min 200 JPY
//   Hong Kong          0.09 %, min 19 HKD
//   Australia          0.09 %, min 9.90 AUD
//
// "All exchange fees are included (exceptions are marked)." Frankfurt and
// Stuttgart specialists are marked, so they stay in the remark — no
// preview in this deposit has priced them. GETTEX, WSE, SGX, TASE, KRX
// and the rest of the IBKR book are not on the card: N/A, not a
// neighbour's floor. Crypto (Zero Hash / Paxos) has no published % .
//
// The American and Canadian caps bind the per-share amount and the
// minimum binds the result, in that order. Floor-then-cap would let 1 %
// of a cheap share cut under 1.90 $.
//
// What is in the number: the commission each way at its floor and cap;
// OTC clearing as printed; UK 0.50 % and Irish 1 % stamp on a share
// purchase (taxMap, else the rates the page says it passes through);
// French / Italian FTT, which the page says it withholds (Italy is
// carried locally — the root map reads Trading212's off-venue zero);
// current SEC and TAF on an American sale (the OTC table still prints
// 0.0000218 / 0.000119 / 5.95 $). CAT is not named. PTM and HK stamp
// are not on the page and are not invented.
//
// Cash is not imposed — the IBKR account holds the listing currency —
// so FX (0.2 bp, min printed per pair) stays in the remark. Inactivity
// (1 $ / month under 1 000 $ NAV with no order), the first withdrawal
// free then 1 € SEPA / 8 € wire, and real-time quotes stay in the remark.
// USA-ADRs print 0.01–0.02 $/share with no floor: the trip uses 0.01, in
// brokerFees, only on a US-listed name that calls itself ADR / GDR / ADS.
// Opening, custody, dividends and TWS are free.
//
//   https://www.whselfinvest.com/en-lu/investing-best-broker/all-exchanges-and-fees
//   https://www.whselfinvest.com/en-DE/investing-best-broker/all-exchanges-and-fees
//
//   node WHSelfInvest/WHSelfInvest_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node WHSelfInvest/WHSelfInvest_cost.mjs VWCE IBIS2 EUR --shares=10 --price=140
//   node WHSelfInvest/WHSelfInvest_cost.mjs TTE SBF EUR --shares=10 --price=60
//   node WHSelfInvest/WHSelfInvest_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("whselfinvest-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.whselfinvest.com/en-lu/investing-best-broker/all-exchanges-and-fees",
  de: "https://www.whselfinvest.com/en-DE/investing-best-broker/all-exchanges-and-fees",
  readOn: "2026-09-18",
  entity: "WH SELFINVEST S.A. (LU), IBKR introducing broker",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "IEX"]);
const ADR_NAMED = /\b(ADR|GDR|ADS)\b/i;

const OWN_FTT = { IT: { name: "ITALIAN_FTT", rate: 0.001 } };

const SPECIALIST_ON_PAGE = {
  frankfurt: { rate: 0.000504, min: 2.52 },
  stuttgart: { rate: 0.000672, min: 0.63, dax: 0.000336 },
};

const WITHDRAW = { firstFree: true, sepa: 1, wire: 8, ccy: "EUR" };
const INACTIVITY = { navBelow: 1000, fee: 1, ccy: "USD" };
const FX_BP = 0.00002;

const RULE = {
  us: { perShare: 0.01, min: 1.9, maxPct: 0.01, ccy: "USD" },
  // The USA-ADRs row: 0.01–0.02 $/share, no minimum, no cap. 0.01 is the
  // figure they print first; 0.015 would be invented.
  adr: { perShare: 0.01, ccy: "USD" },
  ca: { perShare: 0.01, min: 1, maxPct: 0.01, ccy: "CAD" },
  otc: { perShareLow: 0.00003, perShareHigh: 0.003, clearPerShare: 0.0002, clearMaxPct: 0.005, ccy: "USD" },
  xetra: { rate: 0.0009, min: 3.9, max: 89, ccy: "EUR" },
  cheap: { rate: 0.0009, min: 1.9, ccy: "EUR" },
  frankfurt: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  stuttgart: { rate: 0.0009, min: 5.9, ccy: "EUR" },
  at: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  ch: { rate: 0.0009, min: 14, ccy: "CHF" },
  uk: { rate: 0.001, min: 7, ccy: "GBP" },
  fr: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  be: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  nl: { rate: 0.0009, min: 1.9, ccy: "EUR" },
  es: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  it: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  se: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  no: { rate: 0.0009, min: 59, ccy: "NOK" },
  mx: { rate: 0.002, min: 70, ccy: "MXN" },
  jp: { rate: 0.0009, min: 200, ccy: "JPY" },
  hk: { rate: 0.0009, min: 19, ccy: "HKD" },
  au: { rate: 0.0009, min: 9.9, ccy: "AUD" },
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
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const fxCcy = (currency) => {
  const c = String(currency || "").toUpperCase();
  if (c === "GBX") return "GBP";
  if (c === "CNH") return "CNY";
  return c;
};
const dollars = (amount, currency) => {
  const v = toUsd(amount, fxCcy(currency));
  return v == null ? null : Number(v.toPrecision(6));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = fxCcy(from);
  const b = fxCcy(to);
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}
const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(fxCcy(currency)) });
const venueRow = (row) => ({ ...row, exchange: TO_VENUES[row.exchange] || row.exchange });
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const isCrypto = (row) =>
  String(row?.type || "").toUpperCase() === "CRYPTO" || /^(ZEROHASH|PAXOS|CRYPTO)$/i.test(String(row?.exchange || ""));
const isAmerican = (exchange, mic) => US_MICS.has(String(mic || "").toUpperCase()) || US_EX.has(loose(exchange));
const isAdr = (row) => ADR_NAMED.test(String(row?.name || ""));

export function feeMarketOf(exchange, mic, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (code === "ZEROHASH" || code === "PAXOS" || code === "CRYPTO") return "crypto";
  if (code === "PINK" || code === "VALUE" || code === "ARCAEDGE" || code === "OTCBB" || /PINK|OTCM/i.test(code)) {
    return "otc";
  }
  if (m === "BATE" || m === "CHIX" || m === "TRQX" || code === "BATSEUR" || code === "CHIX" || code === "TRQX") {
    return "cheap";
  }
  if (code === "BATS" && (ccy === "EUR" || ccy === "GBP" || ccy === "CHF")) return "cheap";
  if (US_MICS.has(m) || US_EX.has(code)) return "us";
  if (code === "IBIS" || code === "IBIS2" || m === "XETR") return "xetra";
  if (
    code === "TGATE" ||
    code === "TRADEGATE" ||
    m === "XGAT"
  ) {
    return "cheap";
  }
  if (code === "FWB" || code === "FWB2" || m === "XFRA") return "frankfurt";
  if (code === "SWB" || code === "SWB2" || m === "XSTU") return "stuttgart";
  if (code === "VSE" || m === "XWBO") return "at";
  if (code === "EBS" || m === "XSWX") return "ch";
  if (code === "LSE" || code === "LSEETF" || code === "LSEIOB1" || code === "AQSE" || m === "XLON") return "uk";
  if (code === "TSE" || code === "TSX" || code === "VENTURE" || code === "AEQLIT" || m === "XTSE") return "ca";
  if (code === "TSEJ" || m === "XJPX" || m === "XTKS") return "jp";
  if (code === "SBF" || m === "XPAR") return "fr";
  if (code === "AEB" || m === "XAMS") return "nl";
  if (code === "ENEXTBE" || m === "XBRU") return "be";
  if (code === "BVME" || code === "BVMEETF" || m === "XMIL") return "it";
  if (code === "BM" || m === "XMAD" || m === "XMCE") return "es";
  if (code === "OSE" || code === "OMXNO" || m === "XOSL") return "no";
  if (code === "SFB" || m === "XSTO") return "se";
  if (code === "MEXI" || m === "XMEX") return "mx";
  if (code === "SEHK" || m === "XHKG") return "hk";
  if (code === "ASX" || m === "XASX") return "au";
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, (r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && loose(r.ticker) === asked;
  });
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
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = isCrypto(r)
      ? { leaf: null, mic: null }
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
          broker: "whselfinvest",
          ticker: r.ticker,
        });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic, r.currency) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    const hasBook = book.leaf?.bp != null || book.leaf?.perShare != null;
    if (hasBook) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (hasBook) mk.withBook += 1;
  }
  return out;
}

function nativeAmount(shares, price, currency) {
  if (shares == null || price == null) return null;
  const amount = Number(shares) * Number(price);
  if (!Number.isFinite(amount)) return null;
  return String(currency || "").toUpperCase() === "GBX" ? amount / 100 : amount;
}

export function taxesFor(isin, listing) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  const cc = String(isin || "").slice(0, 2).toUpperCase();
  const own = isStock(listing) ? OWN_FTT[cc] : null;
  const already = own && Object.keys(mapped).some((k) => /ITALIAN/i.test(k));
  const added = own && !already ? { [own.name]: own.rate } : {};
  const rates = { ...mapped, ...added };
  if (isStock(listing) && !Object.keys(rates).length) {
    if (cc === "IE" || listing.mic === "XDUB") return { tax, rates: { stamp: IE_STAMP }, added: ["stamp"], source: "whselfinvest" };
    if (cc === "GB" || listing.mic === "XLON") return { tax, rates: { stamp: UK_STAMP }, added: ["stamp"], source: "whselfinvest" };
  }
  return { tax, rates, added: Object.keys(added), source: Object.keys(mapped).length ? "taxMap" : null };
}

function remarkOf({ listing, market } = {}) {
  const lines = [];
  const settle = fxCcy(listing?.currency);
  if (market !== "crypto") lines.push(fxRemark((100 * FX_BP).toFixed(3).replace(/\.?0+$/, ""), settle));
  if (market === "adr") lines.push("USA-ADRs print $0.01–0.02/share; 0.01 used.");
  if (market === "frankfurt" || market === "stuttgart") {
    const s = SPECIALIST_ON_PAGE[market];
    lines.push(
      `Specialist ${(100 * s.rate).toFixed(4)}% (min ${s.min} €) is marked on the ${market} row and is not in the number.`
    );
  }
  return lines.join("\n");
}

/**
 * One side's commission, at the floor and under the cap.
 */
export function commissionSide({ shares, amount, price, market }) {
  const rule = RULE[market];
  if (!rule) return null;

  if (market === "otc") {
    if (shares == null || !Number.isFinite(Number(shares)) || price == null) return null;
    const ps = Number(price) < 1 ? rule.perShareLow : rule.perShareHigh;
    const raw = ps * Number(shares);
    const clearRaw = rule.clearPerShare * Number(shares);
    const clearCap = amount != null ? Number(amount) * rule.clearMaxPct : null;
    const clear = clearCap != null ? Math.min(clearRaw, clearCap) : clearRaw;
    return {
      raw: raw + clear,
      charged: raw + clear,
      clear,
      floored: false,
      capped: clearCap != null && clear < clearRaw,
      currency: rule.ccy,
    };
  }

  if (rule.perShare != null) {
    if (shares == null || !Number.isFinite(Number(shares))) return null;
    const raw = rule.perShare * Number(shares);
    const ceiling = rule.maxPct != null && amount != null ? Number(amount) * rule.maxPct : null;
    const capped = ceiling != null && ceiling < raw;
    const perShareAmount = capped ? ceiling : raw;
    const charged = rule.min != null ? Math.max(rule.min, perShareAmount) : perShareAmount;
    return {
      raw,
      charged,
      floored: rule.min != null && perShareAmount < rule.min,
      capped,
      currency: rule.ccy,
    };
  }

  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const raw = Number(amount) * rule.rate;
  const floored = Math.max(rule.min, raw);
  const charged = rule.max != null ? Math.min(floored, rule.max) : floored;
  return { raw, charged, floored: raw < rule.min, capped: rule.max != null && rule.max < floored, currency: rule.ccy };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `brokerFees` is WH SelfInvest's ticket (and the printed OTC clearing).
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!catalogue) {
    return { ...answer, why: "le catalogue WH SelfInvest n'existe pas encore : lancer `node WHSelfInvest/WHSelfInvest_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue WH SelfInvest` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez WH SelfInvest`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const book = crypto
    ? { leaf: null, mic: null, unsourced: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "whselfinvest",
        ticker: m.row.ticker,
      });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto ? m.row.exchange : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const listed = feeMarketOf(m.row.exchange, listing.mic, listing.currency);
  const market = listed === "us" && isAdr(listing) ? "adr" : listed;
  const rule = market && market !== "crypto" ? RULE[market] : null;
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = isAmerican(m.row.exchange, listing.mic) || market === "us" || market === "adr" || market === "otc";
  const { tax, rates, added, source: taxSource } = taxesFor(listing.isin, listing);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf({ listing, market }),
    withdraw: WITHDRAW,
  };

  if (crypto || market === "crypto") {
    return {
      ...shared,
      basis: `aucun % crypto publié sur la carte actions WHS du ${SCHEDULE.readOn}`,
      why: "Zero Hash / Paxos est au catalogue IBKR, pas sur la carte actions / ETF",
    };
  }

  if (!rule) {
    return {
      ...shared,
      basis: `aucun palier publié pour ${listing.brokerExchange || listing.exchange || "cette place"} chez WH SelfInvest`,
      why:
        `${listing.brokerExchange || listing.exchange || "cette place"} n'a pas de palier sur la carte WHS ` +
        `du ${SCHEDULE.readOn}`,
    };
  }

  const basis =
    `barème WH SelfInvest ${market}, relu le ${SCHEDULE.readOn} : ` +
    (rule.rate != null
      ? `${(100 * rule.rate).toFixed(2)} % par sens`
      : market === "otc"
        ? `OTC ${rule.perShareLow}/${rule.perShareHigh} $ la part`
        : `${rule.perShare} ${rule.ccy} par part`) +
    (rule.min != null ? `, plancher ${rule.min} ${rule.ccy}` : "") +
    (rule.max != null ? `, plafond ${rule.max} ${rule.ccy}` : "") +
    (rule.maxPct != null ? `, plafond ${(100 * rule.maxPct).toFixed(0)} % du montant` : "");

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
    };
  }

  const notional = nativeAmount(n, p, listing.currency);
  const settle = fxCcy(listing.currency);
  const notionalUsd = dollars(notional, settle);
  const notionalInRule = convert(notional, settle, rule.ccy);

  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buyComm = commissionSide({ shares: n, amount: notionalInRule, price: p, market });
  const sellComm = commissionSide({ shares: n, amount: notionalInRule, price: p, market });
  const buyCommUsd = buyComm ? dollars(buyComm.charged, buyComm.currency) : null;
  const sellCommUsd = sellComm ? dollars(sellComm.charged, sellComm.currency) : null;

  const stampUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_PER_SHARE * n, TAF_CAP) : 0;

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, stampUsd, secUsd, tafUsd);
  const brokerFees = plus(buyCommUsd, sellCommUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: {
      commission: finite(buyCommUsd, 6),
      native: buyComm
        ? {
            charged: finite(buyComm.charged, 6),
            raw: finite(buyComm.raw, 6),
            floored: buyComm.floored,
            capped: buyComm.capped,
            currency: buyComm.currency,
          }
        : null,
    },
    sell: {
      commission: finite(sellCommUsd, 6),
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      native: sellComm
        ? {
            charged: finite(sellComm.charged, 6),
            raw: finite(sellComm.raw, 6),
            floored: sellComm.floored,
            capped: sellComm.capped,
            currency: sellComm.currency,
          }
        : null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(plus(buyCommUsd, sellCommUsd), 6),
      réglementaire: finite(plus(secUsd, tafUsd), 6),
      taxes: finite(stampUsd, 6),
    },
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      min: rule.min ?? null,
      max: rule.max ?? null,
      maxPct: rule.maxPct ?? null,
      currency: rule.ccy,
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({
      market,
      rule,
      buyComm,
      marketBp,
      marketPerShare,
      rates,
      taxPct,
      taxSource,
      added,
      american,
      unsourced: m.unsourced,
      listing,
      n,
    }),
  };
}

function confidenceOf({
  market,
  rule,
  buyComm,
  marketBp,
  marketPerShare,
  rates,
  taxPct,
  taxSource,
  added,
  american,
  unsourced,
  listing,
  n,
}) {
  const said = [];
  said.push(
    `commission WH SelfInvest, palier ${market}, lue le ${SCHEDULE.readOn} sur la carte all-exchanges, ` +
      `facturée par sens et convertie en dollars au mid BCE du ${FX_AS_OF}`
  );
  if (buyComm) {
    said.push(
      buyComm.capped
        ? `plafonnée : ${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
        : buyComm.floored
          ? `au plancher : le ticket de ${rule.min} ${rule.ccy} est toute la commission, ` +
            `le calcul au barème n'en donnerait que ${Number(buyComm.raw).toPrecision(3)}`
          : rule.min != null
            ? `au-dessus du plancher : ${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
            : `${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
    );
  }
  if (market === "frankfurt" || market === "stuttgart") {
    const s = SPECIALIST_ON_PAGE[market];
    said.push(
      `spécialiste ${(100 * s.rate).toFixed(4)} % (min ${s.min} €) marqué en exception, hors total : ` +
        `aucun aperçu WHS dans ce dépôt`
    );
  }
  if (rule.perShare != null && rule.min != null && n >= rule.min / rule.perShare) {
    said.push(
      `au-delà de ${Math.round(rule.min / rule.perShare)} parts la commission cesse d'être le ticket ` +
        `et devient ${rule.perShare} ${rule.ccy} la part`
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp).toPrecision(4)} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet 605 × Q IBKR, ${marketPerShare} $ la part, aller-retour`);
  else said.push(`aucun carnet : ${unsourced?.why || "place sans source de spread"} — le total est N/A et non un total sans marché`);

  if (taxPct) {
    const named = Object.entries(rates)
      .map(([k, v]) => `${k} ${(100 * v).toFixed(2)} %`)
      .join(", ");
    said.push(
      `taxe à l'achat ${named}` +
        (added?.includes("ITALIAN_FTT")
          ? `, l'italienne vient de la note WHS (12/2015) et non de la carte racine`
          : taxSource === "whselfinvest"
            ? `, au taux imprimé par WH SelfInvest`
            : `, depuis taxMap.mjs`)
    );
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} la part ` +
        `(plafond ${TAF_CAP} $). La table OTC imprime encore 0,0000218 / 0,000119 / 5,95 $, ` +
        `les chiffres courants sont ceux que le tarif IBKR répercute. CAT n'est pas nommé`
    );
  }
  said.push(
    `hors total : la conversion à ${FX_BP * 1e4} bp, qui dépend de la trésorerie. ` +
      `Le premier retrait du mois civil est gratuit, ensuite ${WITHDRAW.sepa} € SEPA / ${WITHDRAW.wire} € virement`
  );
  said.push(`garde, ouverture et TWS gratuites ; inactivité ${INACTIVITY.fee} $ si NAV < ${INACTIVITY.navBelow} $ sans ordre`);
  said.push(`aucun aller-retour réel dans ce dépôt`);
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          rules: RULE,
          withdraw: WITHDRAW,
          inactivity: INACTIVITY,
          fxBp: FX_BP,
          ownFtt: OWN_FTT,
          specialistOnPage: SPECIALIST_ON_PAGE,
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
      "usage : node WHSelfInvest_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node WHSelfInvest_cost.mjs --schedule\n" +
        "  ex.   node WHSelfInvest_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node WHSelfInvest_cost.mjs VWCE IBIS2 EUR --shares=10 --price=140\n" +
        "        node WHSelfInvest_cost.mjs TTE SBF EUR --shares=10 --price=60"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce que WH SelfInvest propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
