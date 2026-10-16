// What one round trip costs at comdirect: buy n shares at price p, sell
// them back at once, in dollars. The standard online depot, not Pure Depot
// and not a promotional flat fee.
//
// Re-read 2026-10-13 from the price list valid from 15 July 2026:
//   https://www.comdirect.de/wertpapierhandel/konditionen.html
//
//   Inland, each way     4.90 € + 0.25 %, floor 9.90 €, cap 59.90 €
//   Abroad, each way     7.90 € + 0.25 %, floor 12.90 €, cap 62.90 €
//   Xetra, Tradegate, gettex, LS Exchange, Quotrix, Stuttgart
//                        0.0025 % of the value, floor 2.50 €
//   Frankfurt floor, Düsseldorf, Hamburg, Hannover, Munich
//                        0.005 %, floor 5 €
//   LiveTrading          no venue fee, inland commission
//   OTC Markets and the US exchanges publish no customer place
//   fee. The sale adds the SEC fee and the FINRA TAF.
//   Paris, Amsterdam, Milan, Oslo, Athens, and the Access, Growth
//   and Expert Market lines: Euronext's default, €0.13 plus 0.95 bp.
//   London: 0.45 bp, at least 11p. A Zurich share in CHF: CHF 1 plus
//   0.65 bp, at least CHF 0.50. A foreign share on SIX: CHF 1 plus
//   1 bp, at least CHF 1. An ETF on SIX in another currency: CHF 1.50
//   plus 1.50 bp, floor CHF 0.50, cap CHF 150. Vienna: €1.15 plus
//   2 bp, cap €40. Madrid: €0.75 plus 0.65 bp, the variable part at
//   least €0.20. BME Growth: €2 plus 2.50 bp, the variable part at
//   least €0.75. EuroTLX: €1 a trade.
//   An order here is a market order, so it takes the line for
//   removing displayed liquidity. The size is n times p.
//   Stockholm and First North, fee list 1, taker: 7.59 SEK plus
//   0.357 bp. An ETF takes 7.81 SEK plus 0.368 bp, cap 92.50 SEK.
//   Growth Oslo: the Euronext default. Toronto and TSX Venture,
//   12 August 2026: the board-lot part removes displayed liquidity
//   and the odd-lot part is the odd-lot fill. Sydney, TradeMatch:
//   0.15 bp for a share, 0.31 bp for a warrant, cap A$75, plus GST.
//   Tokyo: 0.475 bp. The row does not name the segment.
//   Helsinki, fee list 1, taker: €0.82 plus 0.357 bp. Copenhagen:
//   6.08 DKK plus 0.357 bp. Iceland: 143 ISK plus 0.57 bp.
//   CSE: 0.02 Canadian cents a share at C$1 or more, 0.015 below,
//   and C$2 from 200,000 shares. Cboe US has no customer place fee.
//
//   node brokers/comdirect/comdirect_cost.mjs DE000A1EWWW0 Xetra EUR --shares=10 --price=150
//   node brokers/comdirect/comdirect_cost.mjs DE000A1EWWW0 "Börse Frankfurt" EUR --shares=10 --price=150
//   node brokers/comdirect/comdirect_cost.mjs US0378331005 Nasdaq USD --shares=10 --price=230

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("comdirect-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.comdirect.de/wertpapierhandel/konditionen.html",
  readOn: "2026-10-13",
  entity: "comdirect",
};

const INLAND = { base: 4.9, rate: 0.0025, min: 9.9, max: 59.9 };
const ABROAD = { base: 7.9, rate: 0.0025, min: 12.9, max: 62.9 };
const CHEAP = { rate: 0.000025, min: 2.5 };
const REGIONAL = { rate: 0.00005, min: 5 };
// SEC fee on a sale, and FINRA's trading-activity fee. comdirect passes
// these through and does not restate them. OTC Markets adds no place fee
// of its own for the customer.
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};

function eurOf(amount, currency) {
  const ccy = code(currency);
  if (!(amount >= 0) || !ccy) return null;
  if (ccy === "EUR") return amount;
  const usd = toUsd(amount, ccy);
  const per = usdPer("EUR");
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

const LIVE = new Set(["LANGSCHWARZINTERNATIONAL", "LTSOCIETEGENERALE", "LTBAADERTRADING"]);
const CHEAP_PLACES = new Set(["XETRA", "TRADEGATE", "GETTEX", "LSEXCHANGE", "QUOTRIX", "BORSESTUTTGART", "STUTTGART"]);
const REGIONAL_PLACES = new Set([
  "BORSEFRANKFURT",
  "FRANKFURT",
  "FRA",
  "BORSEDUSSELDORF",
  "DUSSELDORF",
  "BORSEHAMBURG",
  "HAMBURG",
  "BORSEHANNOVER",
  "HANNOVER",
  "MUNICH",
  "MUNCHEN",
  "BORSEBERLIN",
  "BERLIN",
]);
const OTC = new Set(["OTCMARKETS", "FINRAOTCBULLETINBOARD"]);
const US_PLACES = new Set(["NASDAQ", "NEWYORKSTOCKEXCHANGE", "NYSE", "NYSEAMERICAN", "NYSEARCA", "CBOEUSLISTEDONLY"]);
// A Toronto line whose ISIN is also on a US exchange in this catalogue.
// TSX applies the interlisted rate to that name. An interlisted ETF
// keeps the ETF rate.
const INTERLISTED = new Set(
  rows.filter((r) => US_PLACES.has(loose(r.exchange)) && r.isin).map((r) => code(r.isin)),
);
const EURONEXT = new Set([
  "EURONEXTPARIS",
  "EURONEXTAMSTERDAM",
  "EURONEXTMILAN",
  "EURONEXTOSLO",
  "EURONEXTATHENS",
  "EURONEXTACCESSPARIS",
  "EURONEXTGROWTHPARIS",
  "EURONEXTACCESSLISBON",
  "EURONEXTGROWTHBRUSSEL",
  "EURONEXTEXPERTMARKET",
]);
const FOREIGN = new Set([
  "LONDONSTOCKEXCHANGE",
  "SIXSWISSEXCHANGE",
  "WIENERBORSE",
  "BMECONTINUOUSMARKET",
  "BMEALTERNATIVMARKET",
  "EUROTLX",
  "NASDAQSTOCKHOLM",
  "FIRSTNORTHSTOCKHOLM",
  "NASDAQHELSINKI",
  "FIRSTNORTHHELSINKI",
  "NASDAQCOPENHAGEN",
  "FIRSTNORTHDENMARK",
  "NASDAQISLAND",
  "EURONEXTGROWTHOSLO",
  "TORONTOSTOCKEXCHANGE",
  "TSXVENTURE",
  "CANADIANSECURITIESEXCHANGE",
  "AUSTRALIANSECURITIESEXCHANGE",
  "TOKYO",
  ...EURONEXT,
]);

export function scheduleOf(exchange) {
  const e = loose(exchange);
  if (LIVE.has(e)) return "live";
  if (OTC.has(e) || US_PLACES.has(e)) return "uspass";
  if (CHEAP_PLACES.has(e)) return "cheap";
  if (REGIONAL_PLACES.has(e)) return "regional";
  if (FOREIGN.has(e)) return "foreign";
  return null;
}

export function commissionEur(notionalEur, foreign) {
  const plan = foreign ? ABROAD : INLAND;
  return Math.min(plan.max, Math.max(plan.min, plan.base + plan.rate * notionalEur));
}

function isEtf(listing) {
  const t = loose(listing?.type);
  if (t === "ETF" || t === "ETN" || t === "ETC" || t === "ETP") return true;
  return /\bETF\b/.test(String(listing?.name || ""));
}

// TSX and TSX Venture board lot: 100 shares at $1 or more, 500 from
// 10 cents, 1,000 below that. A market order's odd-lot piece is filled
// by the odd-lot dealer.
function boardLot(price) {
  if (price >= 1) return 100;
  if (price >= 0.1) return 500;
  return 1000;
}

function canadaRemoveCad(shares, price, { venture, etf, interlisted }) {
  const lot = boardLot(price);
  const board = Math.floor(shares / lot) * lot;
  const odd = shares - board;
  const under = price < 1;
  const remove = under ? 0.0002 : venture ? 0.0015 : etf ? 0.0017 : interlisted ? 0.0027 : 0.0015;
  return board * remove + odd * (under ? 0.00025 : 0.0005);
}

function exchangeFeeEur(exchange, notional, currency, shares, listing) {
  const e = loose(exchange);
  const eur = eurOf(notional, currency);
  if (eur == null) return null;
  // Euronext cash equities, Option 1, the tariff assigned unless a member
  // opts out. First monthly band: €0.13 plus 0.95 bp. Guide of 1 Oct 2026.
  // Growth Oslo is on that same cash book.
  if (EURONEXT.has(e) || e === "EURONEXTGROWTHOSLO") return 0.13 + eur * 0.000095;
  // London, standard value scheme, first band, minimum 11p an order.
  // Price list of January 2026.
  if (e === "LONDONSTOCKEXCHANGE") {
    const gbp = code(currency) === "GBP" ? notional : dollars(notional, currency);
    const per = usdPer("GBP");
    const inGbp = code(currency) === "GBP" ? notional : gbp != null && per > 0 ? gbp / per : null;
    if (inGbp == null) return null;
    return eurOf(Math.max(0.11, inGbp * 0.000045), "GBP");
  }
  // SIX, standard tariff, no commitment, in force 1 July 2026. A CHF share:
  // transaction fee CHF 1 plus the aggressor 0.65 bp, floor CHF 0.50.
  // A foreign share (Annex F): CHF 1 plus 1 bp, floor CHF 1. An ETF in
  // another currency (Annex K): CHF 1.50 plus 1.50 bp, floor CHF 0.50,
  // cap CHF 150. The fee is in CHF whatever the listing currency.
  if (e === "SIXSWISSEXCHANGE") {
    if (code(currency) === "CHF") return eurOf(1 + Math.max(0.5, notional * 0.000065), "CHF");
    const usd = dollars(notional, currency);
    const per = usdPer("CHF");
    const chf = usd != null && per > 0 ? usd / per : null;
    if (chf == null) return null;
    if (isEtf(listing)) return eurOf(1.5 + Math.min(150, Math.max(0.5, chf * 0.00015)), "CHF");
    return eurOf(1 + Math.max(1, chf * 0.0001), "CHF");
  }
  // Vienna prime market, continuous trading, agent with no commitment:
  // €1.15 plus 2 bp, and the sum is capped at €40. Schedule of 1 Jan 2026.
  if (e === "WIENERBORSE") return Math.min(40, 1.15 + eur * 0.0002);
  // BME, IBEX standard tariff, no monthly commitment. Aggressive execution:
  // €0.75 plus 0.65 bp, and that variable part is at least €0.20. August 2026.
  if (e === "BMECONTINUOUSMARKET") return 0.75 + Math.max(0.2, eur * 0.000065);
  // BME Growth, circular of 26 May 2025. Aggressive execution: €2 plus
  // 2.50 bp, and that variable part is at least €0.75.
  if (e === "BMEALTERNATIVMARKET") return 2 + Math.max(0.75, eur * 0.00025);
  // EuroTLX equity. An intermediary not dealing as principal pays €1 a trade.
  if (e === "EUROTLX") return 1;
  // Nasdaq Helsinki and First North Finland, fee list 1, taker. 1 May 2026.
  if (e === "NASDAQHELSINKI" || e === "FIRSTNORTHHELSINKI") {
    if (code(currency) !== "EUR") return null;
    const fee = isEtf(listing) ? Math.min(10, 0.91 + notional * 0.368 / 10000) : 0.82 + notional * 0.357 / 10000;
    return fee;
  }
  // Nasdaq Copenhagen and First North Denmark, the same list, in kroner.
  if (e === "NASDAQCOPENHAGEN" || e === "FIRSTNORTHDENMARK") {
    if (code(currency) !== "DKK") return null;
    const fee = isEtf(listing) ? Math.min(75, 6.38 + notional * 0.355 / 10000) : 6.08 + notional * 0.357 / 10000;
    return eurOf(fee, "DKK");
  }
  // Nasdaq Iceland. A market order is the taker: 143 ISK plus 0.57 bp.
  if (e === "NASDAQISLAND") {
    if (code(currency) !== "ISK") return null;
    return eurOf(143 + notional * 0.57 / 10000, "ISK");
  }
  // Nasdaq Stockholm and First North Sweden, fee list 1, taker.
  // An ETF uses the ETF taker line, capped at 92.50 SEK an order.
  // 1 May 2026.
  if (e === "NASDAQSTOCKHOLM" || e === "FIRSTNORTHSTOCKHOLM") {
    if (code(currency) !== "SEK") return null;
    const fee = isEtf(listing)
      ? Math.min(92.5, 7.81 + notional * 0.368 / 10000)
      : 7.59 + notional * 0.357 / 10000;
    return eurOf(fee, "SEK");
  }
  // Toronto and TSX Venture, 12 August 2026. A market order in continuous
  // trading removes displayed liquidity. The odd-lot piece is the odd-lot
  // fill. Toronto splits the board-lot rate by the price, an ETF, and a
  // name that is also listed in the US.
  if (e === "TORONTOSTOCKEXCHANGE" || e === "TSXVENTURE") {
    const ccy = code(currency);
    if ((ccy !== "CAD" && ccy !== "USD") || !(shares > 0)) return null;
    const cad = canadaRemoveCad(shares, notional / shares, {
      venture: e === "TSXVENTURE",
      etf: isEtf(listing),
      interlisted: INTERLISTED.has(code(listing?.isin)),
    });
    return eurOf(cad, "CAD");
  }
  // CSE, 1 October 2026. A market order pays the same rate on both sides:
  // 0.02 Canadian cents a share at C$1 or more, 0.015 below, and C$2
  // once the order reaches 200,000 shares.
  if (e === "CANADIANSECURITIESEXCHANGE") {
    const ccy = code(currency);
    if ((ccy !== "CAD" && ccy !== "USD") || !(shares > 0)) return null;
    const cad = shares >= 200000 ? 2 : shares * (notional / shares < 1 ? 0.00015 : 0.0002);
    return eurOf(cad, "CAD");
  }
  // ASX TradeMatch, 27 August 2026, plus GST. A share or an ETF is
  // 0.15 bp. A warrant is 0.31 bp. Both cap at A$75 before GST.
  if (e === "AUSTRALIANSECURITIESEXCHANGE") {
    if (code(currency) !== "AUD") return null;
    const warrant = loose(listing?.name).includes("WARRANT");
    const net = Math.min(75, notional * (warrant ? 0.31 : 0.15) / 10000);
    return eurOf(net * 1.1, "AUD");
  }
  // Tokyo. The standard rate runs from 0.20 to 0.30 per 10,000. The
  // first band that charges is 1.0 times that on Prime, 1.9 on Standard
  // and 2.8 on Growth. The row does not name the segment.
  if (e === "TOKYO") {
    if (code(currency) !== "JPY") return null;
    const standard = (0.2 + 0.3) / 2 / 10000;
    const multiplier = (1 + 1.9 + 2.8) / 3;
    return eurOf(notional * standard * multiplier, "JPY");
  }
  return null;
}

export function venueEur(notionalEur, kind) {
  if (kind === "live" || kind === "foreign") return 0;
  const plan = kind === "cheap" ? CHEAP : kind === "regional" ? REGIONAL : null;
  if (!plan || !(notionalEur >= 0)) return null;
  return Math.max(plan.min, plan.rate * notionalEur);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "the comdirect catalogue is missing: run `node brokers/comdirect/comdirect_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the comdirect catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at comdirect`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "comdirect",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  let marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const american = ["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(listing.mic) && listing.currency === "USD";
  if (american && bp == null && perShare == null && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "comdirect", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null && american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const kind = scheduleOf(listing.brokerExchange);
  const shared = {
    ...answer,
    listing,
    remark: "",
    cashCurrency: "EUR",
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `comdirect schedule re-read on ${SCHEDULE.readOn}: 4.90 € + 0.25% in Germany, ` +
      `7.90 € + 0.25% abroad, plus the German venue fee`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), eur: usdPer("EUR") },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "no number of shares" : "no price for this line: run node assets/prices.mjs" };
  }
  if (!kind) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} has no published venue fee at comdirect` };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const trade = {
    shares: n,
    price: p,
    notional,
    notionalUsd: finite(notionalUsd, 6),
    currency: listing.currency,
  };
  if (kind === "uspass") {
    const notionalEur = eurOf(notional, listing.currency);
    if (notionalEur == null) return { ...shared, trade, why: `no euro rate to convert ${listing.currency}` };
    const commission = commissionEur(notionalEur, true);
    const commissionUsd = dollars(commission * 2, "EUR");
    const sec = notional * SEC_RATE;
    const taf = Math.min(TAF_CAP, n * TAF_PER_SHARE);
    const passUsd = dollars(sec, listing.currency);
    const tafUsd = listing.currency === "USD" ? taf : dollars(taf, "USD");
    const brokerFees = commissionUsd == null || passUsd == null || tafUsd == null ? null : commissionUsd + passUsd + tafUsd;
    const bookUsd =
      parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
    const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
    const usd = plus(bookUsd, brokerFees, taxUsd);
    return {
      ...shared,
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      remark: OTC.has(loose(listing.brokerExchange))
        ? "OTC Markets publishes no customer place fee. The sale adds the SEC fee and the FINRA TAF."
        : "",
      commission: {
        base: ABROAD.base,
        rate: ABROAD.rate,
        min: ABROAD.min,
        cap: ABROAD.max,
        each: commission,
        venueEach: 0,
        sec,
        taf,
        currency: "EUR",
        eachWay: true,
      },
      ...(bookUsd == null
        ? { why: `no book for ${m.unsourced?.name || listing.exchange}: ${m.unsourced?.why || "no book on file"}` }
        : {}),
      trade,
      confidence: `${shared.basis}; OTC Markets has no customer place fee; abroad commission ${commission.toFixed(2)} € a side, plus the SEC fee and the FINRA TAF on the sale`,
    };
  }
  if (kind === "foreign") {
    const venue = exchangeFeeEur(listing.brokerExchange, notional, listing.currency, n, listing);
    if (venue == null) {
      return {
        ...shared,
        usd: null,
        brokerFees: null,
        why: "foreign venue fees are not published",
        remark: "Foreign venue fees are not published.",
        trade,
        confidence: `${shared.basis}; foreign venue fees are not published, so the total is unknown`,
      };
    }
    const notionalEur = eurOf(notional, listing.currency);
    if (notionalEur == null) return { ...shared, trade, why: `no euro rate to convert ${listing.currency}` };
    const commission = commissionEur(notionalEur, true);
    const each = commission + venue;
    const brokerFees = dollars(each * 2, "EUR");
    const bookUsd =
      parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
    const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
    const usd = plus(bookUsd, brokerFees, taxUsd);
    return {
      ...shared,
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      commission: {
        base: ABROAD.base,
        rate: ABROAD.rate,
        min: ABROAD.min,
        cap: ABROAD.max,
        each,
        commissionEach: commission,
        venueEach: venue,
        currency: "EUR",
        eachWay: true,
      },
      ...(bookUsd == null
        ? { why: `no book for ${m.unsourced?.name || listing.exchange}: ${m.unsourced?.why || "no book on file"}` }
        : {}),
      trade,
      confidence: `${shared.basis}; abroad commission ${commission.toFixed(2)} € and the exchange's own fee ${venue.toFixed(2)} €, each side`,
    };
  }

  const notionalEur = eurOf(notional, listing.currency);
  const venue = venueEur(notionalEur, kind);
  if (notionalEur == null || venue == null) {
    return { ...shared, why: `no euro rate to convert ${listing.currency}` };
  }
  const commission = commissionEur(notionalEur, false);
  const each = commission + venue;
  const brokerFees = dollars(each * 2, "EUR");
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    `commission ${commission.toFixed(2)} €, venue ${venue.toFixed(2)} €, each side`,
    "the venue fee is in the number",
    marketPerShare != null
      ? american
        ? `book ${marketPerShare} $ a share, quoted NBBO`
        : `book ${marketPerShare} $ a share`
      : marketBp != null
        ? `book ${marketBp} bp`
        : `no book: ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      base: INLAND.base,
      rate: INLAND.rate,
      min: INLAND.min,
      cap: INLAND.max,
      each,
      commissionEach: commission,
      venueEach: venue,
      currency: "EUR",
      eachWay: true,
    },
    ...(bookUsd == null
      ? { why: `no book for ${m.unsourced?.name || listing.exchange}: ${m.unsourced?.why || "no book on file"}` }
      : {}),
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/comdirect/comdirect_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip    : ${out.usd == null ? "unknown" : `${out.usd} $`}`);
    console.log(`broker fees   : ${out.brokerFees == null ? "unknown" : `${out.brokerFees} $`}`);
  }
  if (out.remark) console.log(out.remark);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
