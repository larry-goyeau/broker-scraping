// What one round trip costs at Standard Chartered Taiwan: buy n
// shares, sell them back, in dollars.
//
// The stock and ETF table is in the account agreement, section II,
// the foreign-share supplement. Read on 2026-10-04.
//   https://www.sc.com/content/dam/sc/tw/zh_tw/investment/docs/general-agreement-deposits.pdf
//   https://www.sc.com/tw/investment/equity/
//   Board, each side            1.5% of the fill
//   Floor, each side            US 10 USD, Hong Kong 80 HKD. Renminbi
//                               has none, so a renminbi line is the
//                               percent alone.
//   myStocks                    US and Hong Kong stocks and ETFs,
//                               0.75% a side. The floor is not halved.
//                               Japan, London and Europe are not on
//                               that channel, so they are not in the
//                               catalogue. The ETF marketing page
//                               prints other floors. The agreement
//                               is the table.
//   Custody                     0.2% of the sale, by the day, for at
//                               most three years. Stocks and ETFs
//                               have no minimum. The days are not an
//                               input, so it stays out. An offshore
//                               book has a 20 USD floor. That is
//                               another client.
//   United States               SEC 0.00206% of the sale. The bank
//                               does not name a US broker-dealer, so
//                               the book is the quoted NBBO.
//   Hong Kong                   stamp 0.1% a side, and 1 HKD when
//                               that stamp is under 1 HKD. AFRC levy
//                               0.00015%, SFC levy 0.0027%, trading
//                               fee 0.00565%, each side. These sit in
//                               the round trip with the commission.
//                               No book is published here, so the
//                               total stays unknown until one is.
//   The public page does not print a spot bid and ask, so the remark
//   has no FX rate.
//
//   node brokers/standardchartered/standardchartered_cost.mjs AAPL US USD --shares=10 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("standardchartered-parsed.json", import.meta.url);
const PAGE = "https://www.sc.com/content/dam/sc/tw/zh_tw/investment/docs/general-agreement-deposits.pdf";
const READ_ON = "2026-10-04";
const ONLINE_RATE = 0.0075;
const SEC_RATE = 0.0000206;
const FLOOR = { USD: 10, HKD: 80, JPY: 1500, GBP: 8, EUR: 8 };
const ONLINE = new Set(["US", "NASDAQ", "NYSE", "ARCA", "HONGKONG"]);
const US_BOOK = new Set(["US", "NASDAQ", "NYSE", "ARCA"]);
const EUROPE = new Set(["XETRA", "FRANKFURT", "PARIS"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const CUSTODY = "Custody is 0.2% a year for at most three years.";

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

function ticket(notional, rate, floor) {
  const percent = notional * rate;
  if (!(floor > 0)) return percent;
  return Math.max(percent, floor);
}

function localCharge(place, currency, notional) {
  if (US_BOOK.has(place)) return { buy: 0, sell: notional * SEC_RATE };
  if (place === "HONGKONG") {
    const stamp = notional * 0.001;
    const stampCharged = currency === "HKD" ? Math.max(stamp, 1) : stamp;
    const other = notional * (0.0000015 + 0.000027 + 0.0000565);
    const side = stampCharged + other;
    return { buy: side, sell: side };
  }
  if (place === "LONDON") {
    const brokerage = notional * 0.001;
    return { buy: brokerage + notional * 0.005, sell: brokerage };
  }
  if (EUROPE.has(place)) {
    const brokerage = notional * 0.001;
    return { buy: brokerage, sell: brokerage };
  }
  if (place === "TOKYO") {
    const brokerage = notional * 0.0011;
    return { buy: brokerage, sell: brokerage };
  }
  return null;
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
    cashCurrency: "",
    url: PAGE,
    remark: CUSTODY,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Standard Chartered n'existe pas encore : lancer `node brokers/standardchartered/standardchartered_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Standard Chartered` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Standard Chartered`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "standardchartered",
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
  const market = loose(listing.brokerExchange);
  if (!ONLINE.has(market)) {
    return { ...answer, listing, onlineBuy: false, cashCurrency: listing.currency, remark: CUSTODY };
  }
  const rate = ONLINE_RATE;
  const floor = FLOOR[listing.currency] ?? null;
  const american = US_BOOK.has(market) && listing.currency === "USD";
  const quoted = american ? usBookPerShare({ broker: "standardchartered", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: CUSTODY,
    basis: `myStocks, accord relu le ${READ_ON}. Achat et vente 0,75 %, plancher non réduit.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const local = localCharge(market, listing.currency, notional);
  if (!local) return { ...shared, why: `${listing.brokerExchange} n'a pas de barème publié` };
  const buy = ticket(notional, rate, floor);
  const sell = ticket(notional, rate, floor);
  const brokerFees = dollars(buy + sell, listing.currency);
  const levyUsd = dollars(local.buy + local.sell, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levyUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate, floor, buy, sell, currency: listing.currency },
    local: { buy: local.buy, sell: local.sell, currency: listing.currency },
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
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
