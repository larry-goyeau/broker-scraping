// What one round trip costs at LOLC Securities: buy n shares at price p on
// the Colombo Stock Exchange, sell them back at once, in dollars. ATrad
// online ("Trade Now") is the live path. Margin, debt securities and the
// phone desk stay out.
//
// LOLC Securities prints no tariff of its own. Read on 2026-10-18: the home
// page, the FAQ, the downloads page, the client agreement (it prints only
// the default interest, up to 0.1 % a day as the Stockbroker Rules allow)
// and the online trading form: no brokerage figure on any of them. On the
// CSE the brokerage on an equity trade up to Rs. 100 million is not the
// broker's to set: the exchange's transaction-cost table fixes it for every
// member firm, in force since 27 June 2017. That table is the schedule here,
// the same lines Capital Alliance prints in its own FAQ.
//
//   Each side, up to Rs. 100 million
//                 0.640 % brokerage
//                 0.084 % CSE, 0.024 % CDS, 0.072 % SEC cess,
//                 0.300 % share transaction levy
//                 1.120 % together.
//   Above Rs. 100 million the brokerage is on a step-up basis with a 0.20 %
//   floor, and negotiable from Rs. 1 billion (SEC directive of 18 March
//   2024): no fixed figure, so such a trade answers N/A.
//   An intraday round trip through the same broker is charged on one side
//   only (CSE rule): this trip stays two sides, the gap is the remark
//   (one 1.12 % ticket instead of two: 50 % lower).
//
//   https://www.cse.lk/pages/transaction-costs/transaction-costs.component.html
//   https://cal.lk/faq-items/what-is-the-brokerage-fee/
//   https://www.lolcsecurities.lk/stock-exchange-faqs/
//   https://www.lolcsecurities.lk/images/site-specific/downloads/client-agreement.pdf
//
// brokerFees is the whole 1.12 % ticket, as LOLC bills it on the contract
// note; the 0.48 % of exchange, depository, cess and levy lines is also
// shown apart. Cash is rupees only (deposits.mjs): no conversion. The CSE
// book is not on file, so the total stays N/A with the reason.
//
//   node brokers/lolc/lolc_cost.mjs JKH.N0000 CSE LKR --shares=100 --price=20
//   node brokers/lolc/lolc_cost.mjs COMB.N0000 CSE LKR --shares=100 --price=150
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

const CATALOGUE = new URL("lolc-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.cse.lk/pages/transaction-costs/transaction-costs.component.html",
  corroboration: "https://cal.lk/faq-items/what-is-the-brokerage-fee/",
  brokerPages: [
    "https://www.lolcsecurities.lk/stock-exchange-faqs/",
    "https://www.lolcsecurities.lk/downloads/",
    "https://www.lolcsecurities.lk/images/site-specific/downloads/client-agreement.pdf",
  ],
  readOn: "2026-10-18",
  inForceFrom: "2017-06-27",
};

const BROKERAGE = 0.0064;
const OTHER = 0.0048;
const RATE = 0.0112;
const FIXED_UP_TO = 100_000_000;
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
 * `usd` is the number the page prints. `brokerFees` is the LOLC ticket.
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
    return { ...answer, why: "the LOLC Securities catalogue is not there yet: run `node brokers/lolc/lolc_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the LOLC Securities catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at LOLC Securities`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "lolc",
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
    remark: "Intraday round trip fees are 50% lower.",
    url: SCHEDULE.url,
    basis: "CSE transaction-cost table (LOLC prints none): 0.64% brokerage, 1.12% with the market lines, each way, up to Rs. 100 million",
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "no share count" : "no price for this line: run node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const trade = { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency };
  if (notional > FIXED_UP_TO) {
    return {
      ...shared,
      trade,
      why: "above Rs. 100 million the CSE brokerage is step-up and negotiable (0.20% floor): LOLC publishes no figure",
    };
  }

  const ticket = notional * RATE * 2;
  const brokerage = notional * BROKERAGE * 2;
  const other = notional * OTHER * 2;
  const commissionUsd = dollars(ticket, CASH);
  const brokerageUsd = dollars(brokerage, CASH);
  const otherUsd = dollars(other, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null || otherUsd == null ? null : otherUsd + notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, notionalUsd == null ? null : notionalUsd * taxTotal);
  const confidence = [
    shared.basis,
    `CSE table in force from ${SCHEDULE.inForceFrom}; Capital Alliance prints the same lines`,
    "LOLC pages read: FAQ, downloads, client agreement, online trading form, none with a rate",
    "CSE, CDS, the SEC cess and the share transaction levy are the market lines",
    "LKR line: no foreign exchange",
    marketBp != null
      ? `book ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `book ${marketPerShare} LKR a share`
        : `no book leaf: ${m.unsourced?.name || listing.exchange}`,
  ].join("; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: { rate: RATE, brokerage: BROKERAGE, eachWay: true, currency: CASH, upTo: FIXED_UP_TO },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `no book for ${m.unsourced?.name || listing.exchange}: ${m.unsourced?.why || "no book leaf"}` }
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
    console.error("usage: node brokers/lolc/lolc_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
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
