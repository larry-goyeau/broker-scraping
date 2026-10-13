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
// which is the note at the top of the stock section. A euro SBF order is
// the Paris row below, not the euro currency row.
//
// Cash needed on LYNX+, account U15604371, 2026-09-29, nothing sent. Where
// the ticket disagrees with the August list, the ticket is the row. Xetra
// is 0.14 % , minimum 6 €, cap 99 €. Frankfurt uses that same commission
// and adds only the specialist, 5.04 bp, minimum 2.52 €: the High Volume
// transaction fee of 0.960 bp is not in the cash line. Stuttgart uses the
// Xetra commission and adds nothing. Gettex and Tradegate are 0.09 % ,
// minimum 6 €, cap 39 €. Vienna is 0.19 % , minimum 6 €. Paris and
// Amsterdam large names are 0.14 % , minimum 6 €, cap 99 €.
//
//   Vienna VSE          EUR  0.19 %          min 6
//   Nasdaq Baltic       EUR  0.39 %          min 20     (Riga is the Paris ticket)
//   Paris SBF           EUR  0.14 %  max 99  min 6   (some smaller names 0.09 % max 39)
//   Xetra IBIS          EUR  0.14 %  max 99  min 6
//   Frankfurt FWB       EUR  0.14 %  max 99  min 6
//                       specialist   5.04 bp, min 2.52 €
//                       custody is still named without a figure
//   Gettex              EUR  0.09 %  max 39  min 6      + unpriced custody
//   Stuttgart SWB       EUR  0.14 %          min 6      + unpriced custody
//   Tradegate           EUR  0.09 %  max 39  min 6      + unpriced custody
//   Amsterdam AEB       EUR  0.14 %  max 99  min 6   (some smaller names 0.09 % max 39)
//   Lisbon BVL          EUR  0.14 %          min 10
//   Singapore SGX       USD  0.15 %          min 10
//   SIX EBS             USD  0.15 %          min 10     (CHF → currency row)
//   London LSE          USD  0.15 %          min 10     (GBP → currency row)
//   OTC / Pink          USD  0.005 $/share, min 1 $, cap 1 %
//                      Demo DUR256326, 2026-10-13. The list's 0.01 $ and
//                      8.90 $ floor are not that ticket. The 1 % cap cuts
//                      under the 1 $ floor on a small order.
//
// Every other currency on the list, per side:
//
//   AED 0.35 %  min 25        HUF 0.15 %  min 4 000
//   AUD 0.15 %  min 10        ILS 0.15 %  min 25
//   CAD 0.02 $/share for the first 2 000, then 0.01, max 3 %, min 6
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
// already includes actually bills. The euro venues named in the table above
// were previewed on LYNX+ on 2026-09-29; the other rows are still the list.
//
// A currency the list does not print — KRW, TWD, INR, MYR, SAR, ZAR,
// RON, CNY, NZD, and a BRL line that is not B3 — answers N/A. Borrowing a
// neighbour's percentage is how the old Mexem file went wrong. B3 in BRL
// is the 2026-10-10 PETR4 preview, the same ticket on the other Interactive
// Brokers accounts: 0.10 % at every size from 56 BRL to 1,120,000 BRL, and
// 0.00 on one share at 0.50 BRL, so no floor and no cap. Singapore in SGD
// is the 2026-10-13 D05 preview on U15604371: 0.19 %, minimum 8 SGD, no
// cap through 500,000 SGD. The August list's 0.15 % and the 0.08 % taken
// from another broker are not that ticket. An SGD line that is not the
// Singapore Exchange, and a Singapore line in another currency, stay N/A. Tel Aviv
// in ILS uses the same 2026-10-10 TEVA preview as WH SelfInvest: 0.10 %,
// minimum 15 ILS, no cap through 600,000 ILS. The August list's 0.15 %
// and 25 ILS floor are not that ticket.
//
// What is in the number: the commission each way at its floor and its cap;
// stamp and transaction tax from `taxMap.mjs` (the list says they are
// passed through and does not restate the rates); current SEC and FINRA
// TAF on a sale of a US-listed or OTC name (the list names third-party
// transaction fees as a class and does not print these two figures); the
// Toronto auction, 0.003 CAD a share capped at 30 CAD, and the Venture
// auction, 0.0012 CAD a share capped at 60 CAD, each charged on both
// sides of the trip. Frankfurt, MIC XFRA, adds the specialist, 5.04 bp
// with a minimum of 2.52 €, on both sides. The market spread is added once.
//
// What is not: the monthly activity fee (€5 minus that month's commissions
// when NAV excluding cash is under €100,000 and the month's commissions
// are under €5; waived for the first three full months after funding, and
// waived outright at €100,000); the withdrawal (first of the calendar
// month free, then €1 SEPA / €8 wire); ADR/GDR/CDI at 0.05 per share on
// the record date; Frankfurt custody, which the LYNX list names without a
// figure; Stuttgart, Gettex and Tradegate custody, which the list names
// without a figure (the ticket adds no exchange fee on those three);
// Prague and Budapest pass-throughs the list names without a figure.
// Warsaw custody is the IBIE pass-through: 0.03 % a year of a PLN stock,
// calculated daily, and it stays out of the ticket;
// Venture extended hours (0.002 CAD a share), which are a session and not this trip.
// Conversion is the client's own order. The list prints no FX commission,
// so none is invented. Custody of an ordinary line is not a ticket.
//
//   node brokers/lynx/lynx_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/lynx/lynx_cost.mjs TTE SBF EUR --shares=10 --price=60
//   node brokers/lynx/lynx_cost.mjs IWDA AEB EUR --shares=1 --price=126
//   node brokers/lynx/lynx_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("lynx-parsed.json", import.meta.url);

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
// Specialist only. The XFRA High Volume transaction fee (0.960 bp, minimum
// 0.60 €) is on the exchange list and not in the LYNX+ cash line of
// 2026-09-29. The 5.04 bp has no tier.
const FRANKFURT_TRADE_RATE = 5.04 / 10000;
const FRANKFURT_TRADE_MIN = 2.52;
const PREVIEWED = new Set(["xetra", "frankfurt", "stuttgart", "gettex", "tradegate", "vienna"]);
const PREVIEWED_NOW = new Set([
  "amsterdam", "paris", "milan", "madrid", "asx", "six-chf", "baltic",
  "tsej", "sfb", "wse", "ose", "cph", "bvl", "ath", "riga", "adx", "dfm", "iob", "canada", "connect", "otc", "pra", "bux",
]);
const PREVIEW = { on: "2026-09-29", account: "U15604371" };

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
// Demo DUR256326, 2026-10-13. Tencent ADR and ICTS. 0.005 $ a share,
// floor 1 $, and the 1 % cap is applied after the floor so a single
// Tencent share at 43 $ is 0.43 $, not 1 $.
const OTC = { perShare: 0.005, min: 1, maxPct: 0.01, capCutsFloor: true, ccy: "USD" };
// Live account U15604371, 2026-10-13. Royal Bank at 10 CAD: 0.02 for the
// first 2 000 shares, then 0.01. One share asks for 6. A 0.10 CAD name
// is cut by the 3 % cap (5 000 shares cost 15 CAD, which is 3 % of 500).
const CAD = { perShare: 0.02, perShareAfter: 0.01, tierAt: 2000, min: 6, maxPct: 0.03, ccy: "CAD" };
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
  { id: "vienna", exchanges: ["VSE"], currencies: ["EUR"], rule: pct(0.0019, 6, "EUR"), note: null },
  { id: "baltic", exchanges: ["N.TALLINN", "N.VILNIUS"], currencies: ["EUR"], rule: pct(0.0039, 20, "EUR"), note: null },
  // Riga is not the Tallinn schedule. Eleving, 2026-10-13: 0.14 %, floor 6, cap 99.
  { id: "riga", exchanges: ["N.RIGA"], currencies: ["EUR"], rule: pct(0.0014, 6, "EUR", 99), note: null },
  { id: "paris", exchanges: ["SBF"], currencies: ["EUR"], rule: pct(0.0014, 6, "EUR", 99), note: null },
  { id: "xetra", exchanges: ["IBIS", "IBIS2"], currencies: ["EUR"], rule: pct(0.0014, 6, "EUR", 99), note: null },
  { id: "frankfurt", exchanges: ["FWB", "FWB2"], currencies: ["EUR"], rule: pct(0.0014, 6, "EUR", 99), note: "frankfurt" },
  { id: "gettex", exchanges: ["GETTEX", "GETTEX2"], currencies: ["EUR"], rule: pct(0.0009, 6, "EUR", 39), note: "custody" },
  { id: "stuttgart", exchanges: ["SWB", "SWB2"], currencies: ["EUR"], rule: pct(0.0014, 6, "EUR"), note: "stuttgart" },
  { id: "tradegate", exchanges: ["TGATE"], currencies: ["EUR"], rule: pct(0.0009, 6, "EUR", 39), note: "custody" },
  // ASML at 200 000 € came back at the 99 € cap. Heineken Holding, Bever,
  // TomTom and Randstad came back at 0.09 % and the 39 € cap. One row
  // cannot tell those names apart; this is the ASML ticket.
  { id: "amsterdam", exchanges: ["AEB"], currencies: ["EUR"], rule: pct(0.0014, 6, "EUR", 99), note: null },
  { id: "milan", exchanges: ["BVME", "BVME.ETF"], currencies: ["EUR"], rule: pct(0.0009, 6, "EUR", 39), note: null },
  { id: "madrid", exchanges: ["BM"], currencies: ["EUR"], rule: pct(0.0009, 6, "EUR", 39), note: null },
  // National Bank of Greece, 2026-10-13: 0.09 %, floor 6, cap 39.
  { id: "ath", exchanges: ["ATH"], currencies: ["EUR"], rule: pct(0.0009, 6, "EUR", 39), note: null },
  // EDP and NOS, 2026-10-13: 0.14 %, floor 10, no cap through 200 000 €.
  { id: "bvl", exchanges: ["BVL"], currencies: ["EUR"], rule: pct(0.0014, 10, "EUR"), note: null },
  { id: "asx", exchanges: ["ASX"], currencies: ["AUD"], rule: pct(0.0014, 10, "AUD"), note: null },
  { id: "six-chf", exchanges: ["EBS"], currencies: ["CHF"], rule: pct(0.0014, 15, "CHF"), note: null },
  { id: "us", exchanges: ["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "IEX", "MEMX", "CBOE"], currencies: ["USD"], rule: USD_LISTED, note: null },
  // Same PETR4 preview as the other Interactive Brokers accounts, 2026-10-10.
  // 0.10 %, no floor, no cap through 1,120,000 BRL.
  { id: "b3", exchanges: ["B3", "BVMF"], currencies: ["BRL"], rule: { rate: 0.001, ccy: "BRL" }, note: null },
  // D05 on U15604371, 2026-10-13. 0.19 %, minimum 8 SGD, no cap through
  // 500 000 SGD. The August list and the other broker's 0.08 % are not used.
  { id: "sg", exchanges: ["SGX"], currencies: ["SGD"], rule: pct(0.0019, 8, "SGD"), note: null },
  // Same TEVA preview as WH SelfInvest, 2026-10-10. 0.10 %, minimum 15 ILS,
  // no cap through 600,000 ILS. The August list's 0.15 % / 25 ILS is not used.
  { id: "ils", exchanges: ["TASE"], currencies: ["ILS"], rule: pct(0.001, 15, "ILS"), note: null },
  // Toyota, 2026-10-13. 0.14 %, floor 500 JPY, no cap through 5 000 000 JPY.
  { id: "tsej", exchanges: ["TSEJ"], currencies: ["JPY"], rule: pct(0.0014, 500, "JPY"), note: null },
  // Volvo and Scandbook. 0.19 %, floor 40 SEK, no cap through 200 000 SEK.
  { id: "sfb", exchanges: ["SFB"], currencies: ["SEK"], rule: pct(0.0019, 40, "SEK"), note: null },
  // Orlen and Reinhold. 0.19 %, floor 20 PLN. Custody stays out of the ticket.
  { id: "wse", exchanges: ["WSE"], currencies: ["PLN"], rule: pct(0.0019, 20, "PLN"), note: "pln" },
  // Equinor. 0.14 %, floor 40 NOK, no cap through 200 000 NOK.
  { id: "ose", exchanges: ["OSE", "OMXNO"], currencies: ["NOK"], rule: pct(0.0014, 40, "NOK"), note: null },
  // Novo Nordisk. 0.14 %, floor 75 DKK, no cap through 200 000 DKK.
  { id: "cph", exchanges: ["CPH"], currencies: ["DKK"], rule: pct(0.0014, 75, "DKK"), note: null },
  // IHC and EMAAR. 0.35 %, floor 25 AED, no cap through 50 000 AED.
  { id: "adx", exchanges: ["ADX", "DFM"], currencies: ["AED"], rule: pct(0.0035, 25, "AED"), note: null },
  // Air Astana GDR. 0.14 %, floor 9 USD, no cap through 100 000 USD.
  { id: "iob", exchanges: ["LSEIOB1"], currencies: ["USD"], rule: pct(0.0014, 9, "USD"), note: null },
  { id: "canada", exchanges: ["TSE", "VENTURE", "PURE", "AEQLIT"], currencies: ["CAD"], rule: CAD, note: null },
  // Moutai and Ping An Insurance on Shanghai Connect, Wuliangye and Ping An
  // Bank on Shenzhen Connect, 2026-10-13. 0.19 %, floor 50 CNH, no cap
  // through 2 000 000 CNH. STAR and ChiNext still answer "no trading permissions".
  { id: "connect", exchanges: ["SEHKNTL", "SEHKSZSE"], currencies: ["CNH"], rule: pct(0.0019, 50, "CNH"), note: null },
  { id: "otc", exchanges: ["PINK"], currencies: ["USD"], rule: OTC, note: null },
  // Demo DUR256326, 2026-10-13. CEZ and Komercni banka. 0.15 %, floor
  // 70 CZK. 10 000 CZK asked for 70. 100 000 asked for 150, 1 000 000 for
  // 1 500, 10 000 000 for 15 000. No cap. The list's 0.25 % and 150 CZK
  // floor are not that ticket.
  { id: "pra", exchanges: ["PRA"], currencies: ["CZK"], rule: pct(0.0015, 70, "CZK"), note: null },
  // Demo DUR256326, 2026-10-13. OTP and Magyar Telekom. 0.55 % up to
  // 4 444 444 HUF, then 0.10 % on the excess, floor 200 HUF. 10 000 000 HUF
  // asked for 30 000 HUF. The list's 0.15 % and 4 000 HUF floor are not
  // that ticket.
  { id: "bux", exchanges: ["BUX"], currencies: ["HUF"], rule: { rate: 0.0055, min: 200, band: 4444444, bandRate: 0.001, ccy: "HUF" }, note: null },
];

const US_TAPE = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "IEX", "MEMX", "CBOE"]);
const NOTE_BY_CCY = { HUF: "bux", CZK: "pra", PLN: "pln", CAD: "canada" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

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
    return { id: venue.id, rule: venue.rule, note: venue.note, american: venue.id === "us" || venue.id === "otc" };
  }
  // The August currency table priced every unnamed place. The 2026-10-10
  // ticket disagreed with it often enough that an unmeasured place stays
  // unknown rather than inherit a neighbour's currency.
  return { id: null, rule: null, note: null, american: false };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
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
    lines.push("Frankfurt adds a custody fee. The list names it and prints no figure.");
  }
  if (note === "stuttgart") {
    lines.push("Stuttgart adds a custody fee. The list names it and prints no figure.");
  }
  if (note === "custody") lines.push("This venue adds a custody fee. The list names it and prints no figure.");
  if (note === "bux") lines.push("Forint adds Budapest exchange, regulatory and custody fees. The list names them and prints no figure.");
  if (note === "pra") lines.push("Koruna adds a Prague pass-through and a custody fee. The list names them and prints no figure.");
  if (note === "pln") lines.push("Custody of a PLN stock is 0.03% a year of the position, calculated daily.");
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
    // OTC applies the percentage cap last, so it can cut under the floor.
    // A listed US share does the opposite: the floor is never cut.
    if (rule.capCutsFloor) {
      const floored = rule.min != null ? Math.max(rule.min, raw) : raw;
      const capped = ceiling != null && ceiling < floored;
      return {
        raw,
        charged: capped ? ceiling : floored,
        floored: rule.min != null && raw < rule.min,
        capped,
        currency: rule.ccy,
      };
    }
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
  if (rule.band != null && rule.bandRate != null) {
    const n = Number(amount);
    const raw = n <= rule.band ? n * rule.rate : rule.band * rule.rate + (n - rule.band) * rule.bandRate;
    const floored = rule.min != null ? Math.max(rule.min, raw) : raw;
    return { raw, charged: floored, floored: rule.min != null && raw < rule.min, capped: false, currency: rule.ccy };
  }
  const raw = Number(amount) * rule.rate;
  const floored = rule.min != null ? Math.max(rule.min, raw) : raw;
  const charged = rule.max != null ? Math.min(floored, rule.max) : floored;
  return {
    raw,
    charged,
    floored: rule.min != null && raw < rule.min,
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

// One Frankfurt execution. Partial fills on the same day are one order.
function frankfurtSide(amountEur) {
  if (!(amountEur > 0)) return null;
  const raw = amountEur * FRANKFURT_TRADE_RATE;
  const specialist = Math.max(FRANKFURT_TRADE_MIN, raw);
  return { specialist, charged: specialist, floored: specialist > raw, currency: "EUR" };
}

function basisOf(id, rule) {
  const head = id === "b3"
    ? `barème LYNX ${id}, même aperçu PETR4 que les autres comptes le 2026-10-10 : `
    : id === "sg"
      ? `barème LYNX ${id}, aperçu D05 du 2026-10-13 sur U15604371 : `
      : id === "ils"
        ? `barème LYNX ${id}, même aperçu TEVA que WH SelfInvest le 2026-10-10 : `
    : PREVIEWED_NOW.has(id)
    ? `barème LYNX ${id}, aperçu du 2026-10-13 : `
    : PREVIEWED.has(id)
      ? `barème LYNX ${id}, aperçu du ${PREVIEW.on} : `
      : `barème LYNX ${id}, liste du ${SCHEDULE.validAsOf} : `;
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
    (rule.band != null
      ? `${(100 * rule.rate).toFixed(2)} % jusqu'à ${rule.band} ${rule.ccy}, puis ${(100 * rule.bandRate).toFixed(2)} %`
      : `${(100 * rule.rate).toFixed(2)} % par sens`) +
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
    return { ...answer, why: "le catalogue LYNX n'existe pas encore : lancer `node brokers/lynx/lynx_scraping.mjs`" };
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
      basis: `aucun palier mesuré pour ${listing.brokerExchange || listing.exchange || "cette place"} chez LYNX`,
      why:
        `${listing.brokerExchange || listing.exchange || "cette place"} n'a pas de commission mesurée : ` +
        `la table par devise n'est plus appliquée`,
    };
  }

  const basis = basisOf(id, rule);
  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
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
  const frankfurt = note === "frankfurt" ? frankfurtSide(notionalInRule) : null;
  const frankfurtUsd = frankfurt ? dollars(frankfurt.charged, frankfurt.currency) : 0;
  const frankfurtRoundUsd = frankfurt ? plus(frankfurtUsd, frankfurtUsd) : 0;

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, stampUsd, secUsd, tafUsd, auctionRoundUsd, frankfurtRoundUsd);
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
      réglementaire: finite(plus(secUsd, tafUsd, auctionRoundUsd, frankfurtRoundUsd), 6),
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
    confidence: confidenceOf({ id, rule, buyComm, marketBp, marketPerShare, rates, taxPct, taxSource, american, unsourced: m.unsourced, note, auction, frankfurt }),
  };
}

function confidenceOf({ id, rule, buyComm, marketBp, marketPerShare, rates, taxPct, taxSource, american, unsourced, note, auction, frankfurt }) {
  const said = [];
  said.push(
    (id === "b3"
      ? `commission LYNX, palier ${id}, même aperçu PETR4 que les autres comptes le 2026-10-10, `
      : id === "sg"
        ? `commission LYNX, palier ${id}, aperçu D05 du 2026-10-13 sur U15604371, `
        : id === "ils"
          ? `commission LYNX, palier ${id}, même aperçu TEVA que WH SelfInvest le 2026-10-10, `
      : PREVIEWED_NOW.has(id)
      ? `commission LYNX, palier ${id}, aperçu du 2026-10-13, `
      : PREVIEWED.has(id)
        ? `commission LYNX, palier ${id}, aperçu du ${PREVIEW.on}, compte ${PREVIEW.account}, `
        : `commission LYNX, palier ${id}, liste du ${SCHEDULE.validAsOf} lue le ${SCHEDULE.readOn}, `) +
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
  if (note === "bux" || note === "pra") said.push("un frais de place est nommé sans chiffre et reste hors total");
  if (note === "pln") said.push("garde des actions en zloty : 0,03 % par an de la position, calculée chaque jour, hors total");
  if (frankfurt) {
    said.push(
      `spécialiste Francfort ${Number(frankfurt.specialist).toPrecision(3)} € par sens` +
        (frankfurt.floored ? `, au plancher de ${FRANKFURT_TRADE_MIN} €` : "") +
        `. Aperçu du ${PREVIEW.on} : l'écart contre Xetra sur Lufthansa. La garde reste sans chiffre`
    );
  }
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
      "usage : node brokers/lynx/lynx_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node brokers/lynx/lynx_cost.mjs --schedule\n" +
        "  ex.   node brokers/lynx/lynx_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node brokers/lynx/lynx_cost.mjs TTE SBF EUR --shares=10 --price=60\n" +
        "        node brokers/lynx/lynx_cost.mjs IWDA AEB EUR --shares=1 --price=126"
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
