// What one round trip costs at justTRADE: buy n shares at price p,
// sell them back at once, in dollars. The order is a single ticket,
// not a savings plan. Certificates, warrants and crypto are other
// lines and are not in this catalogue.
//
// Sutor Bank price list in force from 1 September 2026, read on
// 2026-10-14. Shares, ETFs, ETCs and other ETPs:
//   order commission                         2.90 € a side
//   minimum size                             1 share
//   partner rebate, LS Exchange              1.90 €, so the client pays 1.00 €
//   partner rebate, Tradegate BSX            1.90 €, so the client pays 1.00 €
//   Quotrix and every other venue            no rebate, so the client pays 2.90 €
// Custody is free. Xetra Gold (DE000A0S9GB0) is 0.03 % a month and
// stays off the ticket. The account is one euro clearing account, the
// three venues quote euros, and a foreign-currency dividend is not
// this trip, so there is no FX line.
//
// The venue spread is the place's own quote, read from the book.
// Stamp and transaction tax come from the shared tax map, on the buy
// only. SEC, TAF and the UK panel levy are not on these German books.
//
//   https://www.justtrade.com/fileadmin/Formulare/Preis-und-Leistungsverzeichnis.pdf
//   https://www.justtrade.com/aktienhandel
//
//   node brokers/justtrade/justtrade_cost.mjs 865985 "LS Exchange" EUR --shares=10 --price=230
//   node brokers/justtrade/justtrade_cost.mjs 865985 Quotrix EUR --shares=10 --price=230
//   node brokers/justtrade/justtrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("justtrade-parsed.json", import.meta.url);
const PAGE = "https://www.justtrade.com/fileadmin/Formulare/Preis-und-Leistungsverzeichnis.pdf";
const READ_ON = "2026-10-14";
const CASH = "EUR";
const GROSS = 2.9;
const REBATE = 1.9;
const NET = 1;
const XETRA_GOLD = "DE000A0S9GB0";

const SCHEDULE = {
  source: PAGE,
  readOn: READ_ON,
  inForce: "2026-09-01",
  entity: "Sutor Bank GmbH, for the justTRADE service",
  cash: [CASH],
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

// The price list names LS Exchange and Tradegate BSX. Quotrix is the
// other venue in the catalogue, so it keeps the full 2.90 €.
export function scheduleOf(exchange) {
  const key = loose(exchange);
  if (key === "LSEXCHANGE" || key === "LSEX" || key === "LSX") {
    return { id: "ls", gross: GROSS, rebate: REBATE, net: NET };
  }
  if (key === "TRADEGATE" || key === "TRADEGATEBSX" || key === "XGAT") {
    return { id: "tradegate", gross: GROSS, rebate: REBATE, net: NET };
  }
  if (key === "QUOTRIX" || key === "XQTX") {
    return { id: "quotrix", gross: GROSS, rebate: 0, net: GROSS };
  }
  return null;
}

export function feeMarketOf(row) {
  return scheduleOf(row?.exchange)?.id || null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? listingKey({ exchange: place, mic: place }).venue : null;
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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the net ticket,
 * twice: 1.00 € on LS Exchange and Tradegate, 2.90 € on Quotrix.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "the justTRADE catalogue is not on disk yet: run `node brokers/justtrade/justtrade_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the justTRADE catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at justTRADE`,
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
    broker: "justtrade",
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
  const remark = listing.isin === XETRA_GOLD
    ? "Custody of Xetra Gold is 0.03% a month and stays off this ticket."
    : "";
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    feeMarket: schedule?.id || null,
    remark,
    bp: marketBp,
    perShare: marketPerShare,
    basis: schedule
      ? `justTRADE price list of 1 September 2026, ${schedule.net} € a side on ${listing.brokerExchange}`
      : "No justTRADE ticket for this venue.",
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    commission: schedule
      ? {
          gross: schedule.gross,
          rebate: schedule.rebate,
          net: schedule.net,
          currency: CASH,
          eachWay: true,
        }
      : null,
  };
  if (!schedule) return { ...shared, why: `${listing.brokerExchange || listing.exchange} is not a justTRADE venue` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n >= 1) || !(p > 0)) {
    return {
      ...shared,
      why: !(n >= 1) ? "the minimum order is 1 share" : "no price for this line: run node assets/prices.mjs",
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const brokerFees = dollars(schedule.net * 2, CASH);
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null ? { why: `no order book for ${listing.exchange}` } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify(SCHEDULE, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/justtrade/justtrade_cost.mjs <isin-or-wkn> [venue] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 1,
    price: flag("price") ? Number(flag("price")) : 100,
  });
  console.log(JSON.stringify({
    usd: out.usd,
    brokerFees: out.brokerFees,
    feeMarket: out.feeMarket,
    commission: out.commission,
    why: out.why,
    remark: out.remark,
    listing: out.listing,
  }, null, 2));
}
