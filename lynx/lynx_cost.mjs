// What one round trip costs at LYNX: buy n shares at price p, sell them
// back at once, in dollars.
//
// LYNX B.V. (Amsterdam) introduces onto Interactive Brokers Ireland. The
// catalogue is the IBKR book this account can see (`lynx_scraping.mjs`).
// `nonEuResident` stays priced; `listingAccepts` hides it from an EEA or
// GB visitor, not from an empty country box. Options, futures and funds
// dealt at NAV are not this trip. A fund on a stock exchange pays the
// stock commission, which is what the price list says.
//
// List of Prices and Services, valid 01.08.2026, English translation of
// the Dutch list linked from https://www.lynx.nl/tarieven-kosten-beleggen/ :
// https://documents.lynxbroker.com/documents/IE/NL_List_of_Prices_and_Services_ENG.pdf
// The commission already includes IBKR's. Third-party exchange fees, stamp
// and transaction taxes are passed through on top, where the list names
// them. It does not print a figure for several of those pass-throughs, and
// an unpriced line stays out of the number.
//
// A named venue in the currency the row prints beats the currency table.
// The same venue in another currency falls through to the currency table,
// which is the note at the top of the stock section. Paris in euros is not
// on the venue table — only Paris in dollars is — so a euro SBF order is
// the euro row, 0.10 % , minimum 6 €, cap 145 €. Xetra is not named at all
// and takes the same euro row. Frankfurt and Stuttgart are named, dearer,
// and each adds an unpriced third-party fee that stays in the remark.
//
//   Vienna VSE          EUR  0.15 %          min 10
//   Nasdaq Baltic       EUR  1.50 %  max 99  min 25
//   Paris SBF           USD  0.15 %          min 10     (EUR → currency row)
//   Frankfurt FWB       EUR  0.15 %          min 10     + unpriced trade/custody
//   Gettex              EUR  0.06 %  max 45  min 6      + unpriced custody
//   Stuttgart SWB       EUR  0.15 %          min 10     + unpriced exchange/custody
//   Tradegate           EUR  0.06 %  max 45  min 6      + unpriced custody
//   Amsterdam AEB       EUR  0.06 %  max 145 min 6
//   Amsterdam AEB       USD  0.15 %          min 10
//   Lisbon BVL          EUR  0.15 %          min 6
//   Singapore SGX       USD  0.15 %          min 10
//   SIX EBS             USD  0.15 %          min 10     (CHF → currency row)
//   London LSE          USD  0.15 %          min 10     (GBP → currency row)
//   OTC / Pink          USD  0.01 $/share, max 3 %, min 8.90
//
// Every other currency on the list, per side:
//
//   AED 0.35 %  min 25        HUF 0.15 %  min 4 000
//   AUD 0.15 %  min 10        ILS 0.15 %  min 25
//   CAD 0.02 $/share, max 3 %, min 5
//   CHF 0.15 %  min 15        JPY 0.15 %  min 1 000
//   CNH 0.15 %  min 50        MXN 0.15 %  min 150
//   CZK 0.25 %  min 150       NOK 0.15 %  min 90
//   DKK 0.15 %  min 75        PLN 0.15 %  min 25
//   EUR 0.10 %  max 145, min 6
//   GBP 0.15 %  min 10        RUB 0.15 %  min 900
//   HKD 0.15 %  min 50        SEK 0.15 %  min 90
//                             SGD 0.15 %  min 10
//   USD 0.01 $/share for the first 2 000, then 0.005,
//       max 2 % of the amount, min 5
//
// The marketing examples on the tariffs page still print 3 % for "NDAX".
// The price list, which that page links as the full schedule, prints 2 %
// for USD venues that are not on the venue table, and 3 % only for OTC and
// Canada. This file follows the list.
//
// On a per-share tier the cap binds the per-share amount and the minimum
// binds the result. Floor-then-cap would let 2 % of a cheap share cut
// under the 5 $ minimum. That order is how the IBKR tariff this commission
// already includes actually bills; LYNX itself has not been previewed here.
//
// A currency the list does not print — KRW, TWD, INR, BRL, MYR, SAR, ZAR,
// RON, CNY, NZD — answers N/A. Borrowing a neighbour's percentage is how
// the old Mexem file went wrong.
//
// What is in the number: the commission each way at its floor and its cap;
// stamp and transaction tax from `taxMap.mjs` (the list says they are
// passed through and does not restate the rates); current SEC and FINRA
// TAF on a sale of a US-listed or OTC name (the list names third-party
// transaction fees as a class and does not print these two figures); the
// Toronto auction, 0.003 CAD a share capped at 30 CAD, and the Venture
// auction, 0.0012 CAD a share capped at 60 CAD, each charged on both
// sides of the trip. The market spread is added once.
//
// What is not: the monthly activity fee (€5 minus that month's commissions
// when NAV excluding cash is under €100,000 and the month's commissions
// are under €5; waived for the first three full months after funding, and
// waived outright at €100,000); the withdrawal (first of the calendar
// month free, then €1 SEPA / €8 wire); ADR/GDR/CDI at 0.05 per share on
// the record date; Frankfurt, Stuttgart, Gettex, Tradegate, Prague,
// Budapest and Warsaw pass-throughs the list names without a figure;
// Venture extended hours (0.002 CAD a share), which are a session and not this trip.
// Conversion is the client's own order. The list prints no FX commission,
// so none is invented. Custody of an ordinary line is not a ticket.
//
//   node lynx/lynx_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node lynx/lynx_cost.mjs TTE SBF EUR --shares=10 --price=60
//   node lynx/lynx_cost.mjs IWDA AEB EUR --shares=1 --price=126
//   node lynx/lynx_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("lynx-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://documents.lynxbroker.com/documents/IE/NL_List_of_Prices_and_Services_ENG.pdf",
  page: "https://www.lynx.nl/tarieven-kosten-beleggen/",
  readOn: "2026-09-22",
  validAsOf: "2026-08-01",
  entity: "LYNX B.V. (NL), introducing broker onto Interactive Brokers Ireland",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const ADR_PER_SHARE = 0.05;
const ADR_NAMED = /\b(ADR|GDR|ADS|CDI)\b/i;

const WITHDRAW = { firstFree: true, sepa: 1, wire: 8, ccy: "EUR" };
const ACTIVITY = {
  individual: 5,
  organisational: 15,
  navWaiver: 100000,
  ccy: "EUR",
  waivedMonths: 3,
};

// Per side. `rate` of the amount or `perShare` per share. `perShareAfter`
// replaces `perShare` from the `tierAt`-th share onward (the first 2 000
// US shares stay at 0.01). `max` is an absolute cap, `maxPct` a fraction
// of the amount. `min` is applied after the cap on a per-share tier.
const pct = (rate, min, ccy, max = null) => ({ rate, min, max, ccy });

const USD_LISTED = {
  perShare: 0.01,
  perShareAfter: 0.005,
  tierAt: 2000,
  min: 5,
  maxPct: 0.02,
  ccy: "USD",
};
const OTC = { perShare: 0.01, min: 8.9, maxPct: 0.03, ccy: "USD" };
const CAD = { perShare: 0.02, min: 5, maxPct: 0.03, ccy: "CAD" };
// Opening, closing and reopening auction. Charged per execution, so a
// round trip pays it twice. The cap is per execution.
const AUCTION = {
  TSE: { perShare: 0.003, max: 30, ccy: "CAD" },
  TSX: { perShare: 0.003, max: 30, ccy: "CAD" },
  VENTURE: { perShare: 0.0012, max: 60, ccy: "CAD" },
};

const CCY = {
  AED: pct(0.0035, 25, "AED"),
  AUD: pct(0.0015, 10, "AUD"),
  CAD,
  CHF: pct(0.0015, 15, "CHF"),
  CNH: pct(0.0015, 50, "CNH"),
  CZK: pct(0.0025, 150, "CZK"),
  DKK: pct(0.0015, 75, "DKK"),
  EUR: pct(0.001, 6, "EUR", 145),
  GBP: pct(0.0015, 10, "GBP"),
  HKD: pct(0.0015, 50, "HKD"),
  HUF: pct(0.0015, 4000, "HUF"),
  ILS: pct(0.0015, 25, "ILS"),
  JPY: pct(0.0015, 1000, "JPY"),
  MXN: pct(0.0015, 150, "MXN"),
  NOK: pct(0.0015, 90, "NOK"),
  PLN: pct(0.0015, 25, "PLN"),
  RUB: pct(0.0015, 900, "RUB"),
  SEK: pct(0.0015, 90, "SEK"),
  SGD: pct(0.0015, 10, "SGD"),
  USD: USD_LISTED,
};

// Venue row, and only in the currency the list prints. FWB2 / SWB2 /
// GETTEX2 are the second IBKR code for the same named exchange.
const VENUE = [
  { id: "vienna", exchanges: ["VSE"], currencies: ["EUR"], rule: pct(0.0015, 10, "EUR"), note: null },
  { id: "baltic", exchanges: ["N.RIGA", "N.TALLINN", "N.VILNIUS"], currencies: ["EUR"], rule: pct(0.015, 25, "EUR", 99), note: null },
  { id: "paris-usd", exchanges: ["SBF"], currencies: ["USD"], rule: pct(0.0015, 10, "USD"), note: null },
  { id: "frankfurt", exchanges: ["FWB", "FWB2"], currencies: ["EUR"], rule: pct(0.0015, 10, "EUR"), note: "frankfurt" },
  { id: "gettex", exchanges: ["GETTEX", "GETTEX2"], currencies: ["EUR"], rule: pct(0.0006, 6, "EUR", 45), note: "custody" },
  { id: "stuttgart", exchanges: ["SWB", "SWB2"], currencies: ["EUR"], rule: pct(0.0015, 10, "EUR"), note: "stuttgart" },
  { id: "tradegate", exchanges: ["TGATE"], currencies: ["EUR"], rule: pct(0.0006, 6, "EUR", 45), note: "custody" },
  { id: "amsterdam", exchanges: ["AEB"], currencies: ["EUR"], rule: pct(0.0006, 6, "EUR", 145), note: null },
  { id: "amsterdam-usd", exchanges: ["AEB"], currencies: ["USD"], rule: pct(0.0015, 10, "USD"), note: null },
  { id: "lisbon", exchanges: ["BVL"], currencies: ["EUR"], rule: pct(0.0015, 6, "EUR"), note: null },
  { id: "singapore-usd", exchanges: ["SGX"], currencies: ["USD"], rule: pct(0.0015, 10, "USD"), note: null },
  { id: "six-usd", exchanges: ["EBS"], currencies: ["USD"], rule: pct(0.0015, 10, "USD"), note: null },
  { id: "london-usd", exchanges: ["LSE", "LSEETF", "LSEIOB1"], currencies: ["USD"], rule: pct(0.0015, 10, "USD"), note: null },
  { id: "otc", exchanges: ["PINK", "VALUE", "OTCBB"], currencies: ["USD"], rule: OTC, note: null },
];

const US_TAPE = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "IEX", "MEMX", "CBOE"]);
const NOTE_BY_CCY = { HUF: "bux", CZK: "pra", PLN: "pln", CAD: "canada" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const fxCcy = (currency) => {
  const c = String(currency || "").toUpperCase();
  if (c === "GBX") return "GBP";
  if (c === "CNH") return "CNH";
  return c;
};
const dollars = (amount, currency) => {
  const v = toUsd(amount, fxCcy(currency) === "CNH" ? "CNY" : fxCcy(currency));
  return v == null ? null : Number(v.toPrecision(6));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = fxCcy(from) === "CNH" ? "CNY" : fxCcy(from);
  const b = fxCcy(to) === "CNH" ? "CNY" : fxCcy(to);
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}
const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(fxCcy(currency) === "CNH" ? "CNY" : fxCcy(currency)) });

const venueIndex = VENUE.map((row) => ({
  ...row,
  exchanges: new Set(row.exchanges.map(loose)),
  currencies: new Set(row.currencies),
}));

/**
 * The price-list row for this place and currency: a named venue when the
 * list prints that pair, otherwise the currency table. `american` is a
 * US tape or OTC, which is what carries SEC and TAF. A Paris line dealt
 * in dollars is not one.
 */
export function scheduleOf(exchange, currency) {
  const code = loose(exchange);
  const ccy = fxCcy(currency);
  const venue = venueIndex.find((row) => row.exchanges.has(code) && row.currencies.has(ccy));
  if (venue) {
    return { id: venue.id, rule: venue.rule, note: venue.note, american: venue.id === "otc" };
  }
  const rule = CCY[ccy];
  if (!rule) return { id: null, rule: null, note: null, american: false };
  return {
    id: ccy.toLowerCase(),
    rule,
    note: NOTE_BY_CCY[ccy] || null,
    american: ccy === "USD" && US_TAPE.has(code),
  };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace))
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function nativeAmount(shares, price, currency) {
  if (shares == null || price == null) return null;
  const amount = Number(shares) * Number(price);
  if (!Number.isFinite(amount)) return null;
  return String(currency || "").toUpperCase() === "GBX" ? amount / 100 : amount;
}

export function taxesFor(isin) {
  const tax = taxesOf(isin);
  return { tax, rates: taxRates(tax), source: Object.keys(tax?.buy ?? {}).length ? "taxMap" : null };
}

function remarkOf({ listing, note }) {
  const lines = ["€5 / month if no activity and < 100000 € invested."];
  if (ADR_NAMED.test(String(listing?.name || ""))) {
    lines.push(`ADR/GDR/CDI pass-through ${ADR_PER_SHARE} per share on the record date, not on this trip.`);
  }
  if (note === "frankfurt") {
    lines.push("Frankfurt adds third-party trade fees and a custody fee. The list names them and prints no figure.");
  }
  if (note === "stuttgart") {
    lines.push("Stuttgart adds an exchange fee, a regulatory fee and a custody fee. The list names them and prints no figure.");
  }
  if (note === "custody") lines.push("This venue adds a custody fee. The list names it and prints no figure.");
  if (note === "bux") lines.push("Forint adds Budapest exchange, regulatory and custody fees. The list names them and prints no figure.");
  if (note === "pra") lines.push("Koruna adds a Prague pass-through and a custody fee. The list names them and prints no figure.");
  if (note === "pln") lines.push("Zloty adds a custody fee. The list names it and prints no figure.");
  const place = loose(listing?.brokerExchange);
  if (place === "VENTURE") {
    lines.push("Venture extended hours is 0.002 CAD/share. Not in this trip.");
  }
  return lines.join("\n");
}

/**
 * One side's commission. On a per-share tier the percentage cap is applied
 * to the per-share amount, then the minimum is applied to that result.
 */
export function commissionSide({ shares, amount, rule }) {
  if (!rule) return null;

  if (rule.perShare != null) {
    if (shares == null || !Number.isFinite(Number(shares))) return null;
    const n = Number(shares);
    const tierAt = rule.tierAt ?? Infinity;
    const first = Math.min(n, tierAt);
    const rest = Math.max(0, n - tierAt);
    const raw = rule.perShare * first + (rule.perShareAfter ?? rule.perShare) * rest;
    const ceiling = rule.maxPct != null && amount != null ? Number(amount) * rule.maxPct : null;
    const capped = ceiling != null && ceiling < raw;
    const afterCap = capped ? ceiling : raw;
    const charged = rule.min != null ? Math.max(rule.min, afterCap) : afterCap;
    return {
      raw,
      charged,
      floored: rule.min != null && afterCap < rule.min,
      capped,
      currency: rule.ccy,
    };
  }

  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const raw = Number(amount) * rule.rate;
  const floored = Math.max(rule.min, raw);
  const charged = rule.max != null ? Math.min(floored, rule.max) : floored;
  return {
    raw,
    charged,
    floored: raw < rule.min,
    capped: rule.max != null && charged < floored,
    currency: rule.ccy,
  };
}

function auctionOf(exchange) {
  return AUCTION[loose(exchange)] || null;
}

// One execution. The cap is that execution's, not the round trip's.
function auctionSide(shares, spec) {
  if (!spec || !(Number(shares) > 0)) return null;
  const raw = spec.perShare * Number(shares);
  const charged = Math.min(raw, spec.max);
  return { raw, charged, capped: raw > spec.max, max: spec.max, currency: spec.ccy };
}

function basisOf(id, rule) {
  const head = `barème LYNX ${id}, liste du ${SCHEDULE.validAsOf} : `;
  if (rule.perShare != null) {
    const tier =
      rule.perShareAfter != null
        ? `${rule.perShare} ${rule.ccy} la part jusqu'à ${rule.tierAt}, puis ${rule.perShareAfter}`
        : `${rule.perShare} ${rule.ccy} la part`;
    return (
      head +
      tier +
      (rule.min != null ? `, plancher ${rule.min} ${rule.ccy}` : "") +
      (rule.maxPct != null ? `, plafond ${(100 * rule.maxPct).toFixed(0)} % du montant` : "")
    );
  }
  return (
    head +
    `${(100 * rule.rate).toFixed(2)} % par sens` +
    (rule.min != null ? `, plancher ${rule.min} ${rule.ccy}` : "") +
    (rule.max != null ? `, plafond ${rule.max} ${rule.ccy}` : "")
  );
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `brokerFees` is LYNX's commission only. Stamp, SEC, TAF and the
 * spread sit in `usd` and not in `brokerFees`.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!catalogue) {
    return { ...answer, why: "le catalogue LYNX n'existe pas encore : lancer `node lynx/lynx_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue LYNX` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez LYNX`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "lynx",
    ticker: m.row.ticker,
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
  };

  const scheduled = scheduleOf(m.row.exchange, fxCcy(listing.currency));
  const { id, rule, note, american } = scheduled;
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const { tax, rates, source: taxSource } = taxesFor(listing.isin);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: id,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: null,
    remark: remarkOf({ listing, note }),
    withdraw: WITHDRAW,
    activity: ACTIVITY,
  };

  if (!rule) {
    return {
      ...shared,
      basis: `aucune devise publiée pour ${listing.currency || "cette ligne"} chez LYNX`,
      why: `${listing.currency || "cette devise"} n'est pas au barème LYNX du ${SCHEDULE.validAsOf}`,
    };
  }

  const basis = basisOf(id, rule);
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

  const buyComm = commissionSide({ shares: n, amount: notionalInRule, rule });
  const sellComm = commissionSide({ shares: n, amount: notionalInRule, rule });
  const buyCommUsd = buyComm ? dollars(buyComm.charged, buyComm.currency) : null;
  const sellCommUsd = sellComm ? dollars(sellComm.charged, sellComm.currency) : null;

  const stampUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_PER_SHARE * n, TAF_CAP) : 0;
  const auction = auctionSide(n, auctionOf(m.row.exchange));
  const auctionUsd = auction ? dollars(auction.charged, auction.currency) : 0;
  const auctionRoundUsd = auction ? plus(auctionUsd, auctionUsd) : 0;

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, stampUsd, secUsd, tafUsd, auctionRoundUsd);
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
      auction: auction ? finite(auctionUsd, 6) : null,
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
      auction: auction ? finite(auctionUsd, 6) : null,
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
      réglementaire: finite(plus(secUsd, tafUsd, auctionRoundUsd), 6),
      taxes: finite(stampUsd, 6),
    },
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      perShareAfter: rule.perShareAfter ?? null,
      tierAt: rule.tierAt ?? null,
      min: rule.min ?? null,
      max: rule.max ?? null,
      maxPct: rule.maxPct ?? null,
      currency: rule.ccy,
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({ id, rule, buyComm, marketBp, marketPerShare, rates, taxPct, taxSource, american, unsourced: m.unsourced, note, auction }),
  };
}

function confidenceOf({ id, rule, buyComm, marketBp, marketPerShare, rates, taxPct, taxSource, american, unsourced, note, auction }) {
  const said = [];
  said.push(
    `commission LYNX, palier ${id}, liste du ${SCHEDULE.validAsOf} lue le ${SCHEDULE.readOn}, ` +
      `facturée par sens et convertie en dollars au mid BCE du ${FX_AS_OF}`
  );
  if (buyComm) {
    said.push(
      buyComm.capped
        ? `plafonnée : ${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
        : buyComm.floored
          ? `au plancher : le ticket de ${rule.min} ${rule.ccy} est toute la commission, ` +
            `le calcul au barème n'en donnerait que ${Number(buyComm.raw).toPrecision(3)}`
          : `${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
    );
  }
  if (rule.perShare != null && rule.maxPct != null) {
    said.push("le plafond borne le montant à la part, puis le plancher borne le résultat");
  }
  if (note && note !== "canada") said.push("un frais de place est nommé sans chiffre et reste hors total");
  if (auction) {
    said.push(
      `enchère ${Number(auction.charged).toPrecision(4)} ${auction.currency} par sens` +
        (auction.capped ? `, plafonnée à ${auction.max} ${auction.currency}` : "")
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp).toPrecision(4)} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet 605 × Q IBKR, ${marketPerShare} $ la part, aller-retour`);
  else said.push(`aucun carnet : ${unsourced?.why || "place sans source de spread"} — le total est N/A et non un total sans marché`);
  if (taxPct) {
    const named = Object.entries(rates)
      .map(([k, v]) => `${k} ${(100 * v).toFixed(2)} %`)
      .join(", ");
    said.push(`taxe à l'achat ${named}` + (taxSource === "taxMap" ? ", depuis taxMap.mjs" : ""));
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant, TAF FINRA ${TAF_PER_SHARE} la part (plafond ${TAF_CAP} $). ` +
        `La liste nomme les frais de tiers sans imprimer ces deux taux`
    );
  }
  said.push("aucun aller-retour réel dans ce dépôt");
  return said.join(" ; ");
}

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const { id } = scheduleOf(r.exchange, r.currency);
    const key = id || "?";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, currencies: CCY, venues: VENUE.map(({ id, exchanges, currencies }) => ({ id, exchanges, currencies })), withdraw: WITHDRAW, activity: ACTIVITY, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node lynx/lynx_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node lynx/lynx_cost.mjs --schedule\n" +
        "  ex.   node lynx/lynx_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node lynx/lynx_cost.mjs TTE SBF EUR --shares=10 --price=60\n" +
        "        node lynx/lynx_cost.mjs IWDA AEB EUR --shares=1 --price=126"
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
    if (out.alternatives?.length) console.log(`\nce que LYNX propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
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
  if (out.basis) console.log(`\n${out.basis}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
  if (out.remark) console.log(`\n${out.remark}`);
}
