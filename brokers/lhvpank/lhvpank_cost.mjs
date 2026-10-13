// What one round trip costs at LHV Pank: buy n shares at price p,
// sell them back at once, in dollars. The order is entered in the
// internet bank or the mobile app, under Investing. LHV Trader and
// the Growth Account are other products and are not this ticket.
//
// Securities section of the price list in force from 1 August 2026,
// the securities lines themselves dated 9 June 2025, read on 2026-10-13:
//   Tallinn, Riga, Vilnius                         0
//   the 101st Baltic transaction in a calendar
//   month                                          0.2 % of that fill
//   US, Helsinki, Stockholm, Xetra, London,
//   Toronto, Moscow, Copenhagen, Oslo, Milan,
//   Madrid, Paris, Amsterdam, Lisbon, Brussels,
//   Vienna, Warsaw, Zurich                         0.14 % a side, minimum 5 €
//   Australia, Budapest, Mexico, Tokyo,
//   Hong Kong, Singapore                           upon agreement
// The fee is taken in the trading currency. The 5 € floor is converted
// into that currency. Custody is free up to 100 000 € and stays off
// the ticket. A phone or branch order adds 25 € and is not this trip.
//
// The share lines name shares. The securities-account page puts ETFs
// on the same 0.14 % service charge, and the Growth Account line
// prices stocks and ETFs together, so a listed fund on a named place
// takes the share rate. Mutual funds are the separate 1 % line and
// are not in this catalogue.
//
// A US order is transmitted to Interactive Brokers LLC. The US book is
// that firm's Q. A European book stays the quoted touch.
// https://www.lhv.ee/en/information-on-investment-services
//
// Footnote 1 names a purchase tax: 0.2 % Spain, 0.2 % Italy, 0.4 %
// France, 0.5 % United Kingdom, 1 % Ireland. The amount comes from
// the shared tax map, on the buy only.
//
// Currency exchange uses the bank's buy and sell rates, not a
// percentage on the securities tariff. The remark is half the gap
// between those two rates, read on the public calculator at 23:45
// on 2026-10-13. A euro listing has no line: the table is quoted
// against the euro.
//
//   https://www.lhv.ee/en/price-list-01-08-2026
//   https://www.lhv.ee/en/securities-account
//
//   node brokers/lhvpank/lhvpank_cost.mjs AIR "Tallinn Stock Exchange" EUR --shares=100 --price=2
//   node brokers/lhvpank/lhvpank_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("lhvpank-parsed.json", import.meta.url);
const PAGE = "https://www.lhv.ee/en/price-list-01-08-2026";
const READ_ON = "2026-10-13";
const RATE = 0.0014;
const MINIMUM_EUR = 5;
const BALTIC_OVER = 0.002;

// Foreign units for 1 euro: LHV buys, LHV sells. Half the gap is one side.
// https://www.lhv.ee/en/currency-calculator
const FX_QUOTE = {
  AUD: [1.64132, 1.56695],
  CAD: [1.62909, 1.55564],
  CHF: [0.95363, 0.91116],
  CZK: [25.01379, 23.72765],
  DKK: [7.61922, 7.33019],
  GBP: [0.86324, 0.82606],
  HKD: [9.06618, 8.51052],
  HUF: [380.95449, 346.98386],
  JPY: [181.46458, 173.16795],
  NOK: [10.92144, 10.42519],
  PLN: [4.47314, 4.2733],
  RON: [5.56175, 5.11482],
  SEK: [11.39849, 10.92525],
  USD: [1.13982, 1.09978],
};

function fxHalf(currency) {
  const key = listingCash(currency);
  const pair = FX_QUOTE[key];
  if (!pair) return "";
  const [buy, sell] = pair;
  const mid = (buy + sell) / 2;
  const half = ((buy - sell) / mid) * 50;
  return half.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

const BALTIC = new Set([
  "Tallinn Stock Exchange",
  "Riga Stock Exchange",
  "Vilnius Stock Exchange",
]);

const NAMED = new Set([
  "American Stock Exchange",
  "NASDAQ",
  "New York Stock Exchange",
  "Helsinki Stock Exchange",
  "Stockholm Stock Exchange",
  "XETRA",
  "London Stock Exchange",
  "London Stock Exchange IOB",
  "Toronto Stock Exchange",
  "Moscow Exchange",
  "Copenhagen Stock Exchange",
  "Oslo Stock Exchange",
  "Milano Stock Exchange",
  "Sistema De Interconexion Bursatil Espanol",
  "Euronext Paris Monep",
  "Society des Bourses Francaises",
  "NYSE Euronext Amsterdam",
  "NYSE Euronext Brussels",
  "NYSE Euronext Lisbon",
  "Vienna Stock Exchange",
  "Warsaw Stock Exchange",
  "Swiss Exchange",
]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// Five euros, expressed in the currency the security is quoted in.
function floorIn(currency) {
  const eur = usdPer("EUR");
  const quote = usdPer(currency);
  if (!eur || !quote) return null;
  return (MINIMUM_EUR * eur) / quote;
}

const PRO_TYPES = new Set(["ETF", "ETC", "ETN", "ETP"]);
const US_EXCHANGES = new Set(["American Stock Exchange", "NASDAQ", "New York Stock Exchange"]);

// LHV's search names a grantor trust without the word ETF, so the catalogue
// stores iShares Gold Trust as a share. The shared list name is what says
// the ISIN is an exchange-traded product. A closed-end fund stays a share.
function exchangeTradedName(name) {
  return /\bETFs?\b|\bETCs?\b|\bETNs?\b|\bETPs?\b/i.test(name)
    || /\b(iShares|SPDR|ProShares|WisdomTree|First Trust|Direxion|VanEck|Global X|Vanguard)\b/i.test(name)
    || /\b(Gold Trust|Silver Trust|Gold Shares|QQQ Trust|Oil Fund|Natural Gas Fund)\b/i.test(name);
}

function exchangeTradedIsins() {
  const found = new Set();
  const file = new URL("../../assets/etfs.csv", import.meta.url);
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = String(columns[2] || "").trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    if (exchangeTradedName(columns.slice(3).join(","))) found.add(isin);
  }
  return found;
}
const EXCHANGE_TRADED = exchangeTradedIsins();

function reservedForPros(row) {
  const type = String(row?.type || "").toUpperCase();
  const isin = String(row?.isin || "").toUpperCase();
  const namedFund = PRO_TYPES.has(type);
  // The catalogue type is a share. Trust the shared list only on a US
  // exchange, where this ticker is that product. The same ISIN on Moscow
  // or Toronto is a different listing that borrowed the code.
  const listedFund = !namedFund && EXCHANGE_TRADED.has(isin) && US_EXCHANGES.has(row?.exchange);
  if (!namedFund && !listedFund) return false;
  if (isin.startsWith("US")) return true;
  return namedFund && US_EXCHANGES.has(row?.exchange);
}

function scheduleOf(exchange) {
  if (BALTIC.has(exchange)) return { id: "baltic", rate: 0, minimumEur: 0 };
  if (NAMED.has(exchange)) return { id: "named", rate: RATE, minimumEur: MINIMUM_EUR };
  return null;
}

function side(notional, currency, schedule) {
  if (schedule.id === "baltic") return 0;
  const floor = floorIn(currency);
  if (floor == null) return null;
  return Math.max(notional * schedule.rate, floor);
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
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "the LHV Pank catalogue is not on disk yet: run `node brokers/lhvpank/lhvpank_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the LHV Pank catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at LHV Pank`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const schedule = scheduleOf(m.row.exchange);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "lhvpank",
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
  const notes = [];
  const reserved = reservedForPros(m.row);
  if (m.row.remark && m.row.remark !== "Réservé aux clients professionnels." && m.row.remark !== "Reserved for professional clients.") {
    notes.push(m.row.remark);
  }
  if (schedule?.id === "baltic") {
    notes.push(
      `The first 100 Baltic transactions in a calendar month are free. After that, ${BALTIC_OVER * 100}% of the fill, each order.`
    );
  }
  const fx = fxHalf(listing.currency);
  if (fx) notes.push(fxRemark(fx, listing.currency));
  const agreement = schedule ? "" : "No published commission: LHV marks these shares upon agreement.";
  const remark = [reserved ? "Reserved for professional clients." : "", notes.join(" "), agreement].filter(Boolean).join("\n");

  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const stamp = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const basis = !schedule
    ? `online order, tariff read on ${READ_ON}. No published commission for this venue.`
    : schedule.id === "baltic"
      ? `online order, tariff read on ${READ_ON}. Baltic shares at 0.`
      : `online order, tariff read on ${READ_ON}. 0.14% each order, minimum €5, charged in the trading currency.`;
  const shared = {
    ...answer,
    listing,
    remark,
    cashCurrency: listing.currency || "EUR",
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), eur: usdPer("EUR") },
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    commission: {
      rate: schedule?.rate ?? null,
      minimumEur: schedule?.minimumEur ?? null,
      eachWay: true,
      currency: listing.currency,
      schedule: schedule?.id || "upon-agreement",
    },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "no share count" };
  if (!(p > 0)) return { ...shared, why: "no price for this line: run node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = schedule ? side(notional, listing.currency, schedule) : null;
  if (schedule && each == null) return { ...shared, why: `no exchange rate to convert the €5 minimum into ${listing.currency}` };
  const ticket = each == null ? null : each * 2;
  const brokerFees = ticket == null ? null : dollars(ticket, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * stamp;
  const usd = schedule ? plus(bookUsd, brokerFees, taxUsd) : null;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    taxes: finite(taxUsd, 6),
    taxRates: Object.keys(taxRates(tax)).length ? taxRates(tax) : null,
    ...(bookUsd == null
      ? { why: `no order book for ${listing.exchange}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { ...shared.commission, each, eachWay: true },
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  }), null, 2));
}

printCli();
