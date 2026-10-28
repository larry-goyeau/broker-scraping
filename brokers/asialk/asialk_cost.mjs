// What one round trip costs at Asia Securities: buy n shares at price p on
// the Colombo Stock Exchange, sell them back at once, in dollars. The live
// path is ATrad (web and mobile, "Online Trading Login"). Margin, debt
// securities and the phone desk stay out.
//
// Asia Securities prints the exchange's table in its FAQ, read on
// 2026-10-26: "Transactions up to LKR 100 million - 1.12%", "Brokerage
// Fees 0.6400%", step-up above that. It is not the broker's to set: on
// the CSE the bill on an equity trade up to Rs. 100 million is fixed by
// the exchange for every member firm.
//
// The figures live in the shared ../asialk/cseCost.mjs. CSE table,
// "Equity - with effect from 28th July 2025", read on 2026-10-26:
//
//   Each side, up to Rs. 100 million
//                 0.640 % brokerage
//                 0.084 % CSE, 0.012 % CDS, 0.012 % clearing (CSE Clear),
//                 0.072 % SEC cess, 0.300 % share transaction levy
//                 1.120 % together.
//   Above Rs. 100 million the brokerage is on a step-up basis with a 0.20 %
//   floor, negotiable from Rs. 1 billion (SEC directive of 18 March 2024):
//   no fixed figure, so such a trade answers N/A.
//   A same-day buy and sell through the same broker drops the brokerage,
//   CSE, CDS, clearing and SEC lines on one side; "Share Transaction Levy
//   will be charged from both sides". This trip stays two full sides, the
//   0.82 % saving is the remark ("Same day sell fees are 73% lower.": 1.12 % → 0.30 %).
//
//   https://www.cse.lk/investors/transaction-costs
//   https://www.cse.lk/locales/en/transaction-cost.json  (the page's text)
//   https://www.asiasecurities.lk/faqs
//   https://www.asiasecurities.lk/client-solution/stockbroking/online-and-mobile-trading
//
// brokerFees is the whole 1.12 % ticket each way, as the contract note
// bills it; commission is the 0.64 % brokerage, taxes the 0.48 % of
// exchange, depository, clearing, cess and levy lines. No minimum in
// rupees. Cash is rupees (a foreign client funds through an SIA/IIA bank
// account and pays the broker in rupees): no conversion. No stamp duty;
// no capital gains tax on quoted shares. The CSE book is not on file, so
// the total stays N/A with the reason.
//
//   node brokers/asialk/asialk_cost.mjs JKH.N0000 CSE LKR --shares=18300 --price=17.7
//   node brokers/asialk/asialk_cost.mjs COMB.N0000 CSE LKR --shares=1658 --price=195.25
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import {
  cseRoundTrip,
  CSE_RATE,
  CSE_BROKERAGE,
  CSE_OTHER,
  CSE_FIXED_UP_TO,
  CSE_REMARK,
  CSE_BASIS,
  CSE_SCHEDULE,
} from "./cseCost.mjs";

const CATALOGUE = new URL("asialk-parsed.json", import.meta.url);
const BROKER_PAGES = [
  "https://www.asiasecurities.lk/faqs",
  "https://www.asiasecurities.lk/client-solution/stockbroking/online-and-mobile-trading"
];
const CASH = "LKR";

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
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
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
 * `usd` is the number the page prints. `brokerFees` is the CSE ticket.
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
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Asia Securities manque : lancer `node brokers/asialk/asialk_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Asia Securities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Asia Securities`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "asialk",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    remark: CSE_REMARK,
    url: CSE_SCHEDULE.url,
    sources: [CSE_SCHEDULE.url, CSE_SCHEDULE.text, ...BROKER_PAGES],
    basis: CSE_BASIS,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "pas de nombre d'actions" : "pas de prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const trade = { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency };
  const bill = cseRoundTrip(notional);
  if (bill.why) return { ...shared, trade, why: bill.why };

  const ticketUsd = dollars(bill.ticket, CASH);
  const brokerageUsd = dollars(bill.brokerage, CASH);
  const otherUsd = dollars(bill.other, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null || otherUsd == null ? null : otherUsd + notionalUsd * taxTotal;
  const usd = plus(bookUsd, ticketUsd, notionalUsd == null ? null : notionalUsd * taxTotal);
  const confidence = [
    CSE_BASIS,
    `tableau du CSE lu le ${CSE_SCHEDULE.readOn}, en vigueur depuis le ${CSE_SCHEDULE.inForceFrom}`,
    "FAQ Asia Securities : mêmes 1,12 %, courtage 0,64 %, progressif au-delà de 100 millions",
    "CSE, CDS, compensation, contribution SEC et taxe sur les transactions d'actions sont les lignes du marché",
    "ligne en roupies : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} LKR par action`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join("; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(ticketUsd, 6),
    commission: { rate: CSE_RATE, brokerage: CSE_BROKERAGE, other: CSE_OTHER, eachWay: true, currency: CASH, upTo: CSE_FIXED_UP_TO },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `pas de carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade,
    parts: {
      market: finite(bookUsd, 6),
      commission: finite(brokerageUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

function calledDirectly() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (calledDirectly()) {
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/asialk/asialk_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  const show = (value) => (value == null ? "N/A" : value);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const listing = out.listing;
  console.log(`${listing.ticker || listing.isin} — ${listing.name || ""}`);
  console.log(`${listing.exchange}${listing.mic ? ` (${listing.mic})` : ""}, ${listing.currency}, ${(listing.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} share${t.shares > 1 ? "s" : ""} at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
  }
  console.log(`round trip : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
  console.log(`broker fees: ${show(out.brokerFees)} $`);
  const bill = out.parts || {};
  if (bill.market != null) console.log(`  book       : ${bill.market} $`);
  if (bill.commission != null) console.log(`  commission : ${bill.commission} $`);
  if (bill.taxes) console.log(`  taxes      : ${bill.taxes} $`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
