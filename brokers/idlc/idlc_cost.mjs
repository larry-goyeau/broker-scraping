// What one round trip costs at IDLC Securities: buy n shares at price p,
// sell them back at once, in dollars. The live path is DSE-Mobile and
// DSE-Investor. The branch, the phone and i-Trade's desk stay out of a
// different rate: none is printed. The annual BO fee stays out.
//
// The charge table prints the account opening, the yearly BO fee, a
// transfer, a demat and a pledge. It does not print the commission on
// a trade. A 2021 profile of the firm prints 0.40 % for brokerage
// services. No floor is printed. DSE levies are not on that table, so
// they stay out. The BSEC ceiling is 1 % and stays out. The book is
// Dhaka only.
//
//   https://idlc.com/securities/knowledgebase/faq
//   http://dspace.daffodilvarsity.edu.bd:8080/bitstream/handle/123456789/9710/22337.pdf
//   https://www.sec.gov.bd/home/iguide
//
//   Each side    0.40 % of the amount.
//
// This trip is two sides.
//
//   node brokers/idlc/idlc_cost.mjs GP DSE BDT --shares=100 --price=238
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("idlc-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://idlc.com/securities/knowledgebase/faq",
  readOn: "2026-10-16",
};

const RATE = 0.004;
const CASH = "BDT";

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
 * `usd` is the number the page prints. `brokerFees` is the IDLC ticket.
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
    return { ...answer, why: "the IDLC catalogue is not there yet: run `node brokers/idlc/idlc_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the IDLC catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at IDLC`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "idlc",
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
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    remark: "",
    url: SCHEDULE.url,
    basis: "IDLC profile, 2021: 0.40% of the amount, each way",
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
  const ticket = notional * RATE * 2;
  const commissionUsd = dollars(ticket, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    "the charge table prints no trade commission",
    "opening, the yearly BO fee, a transfer, a demat and a pledge stay out",
    "no floor is printed",
    "DSE levies are not on the table, so they stay out",
    "the 1% ceiling stays out",
    "branch and phone stay out",
    "BDT line: no foreign exchange",
    marketBp != null
      ? `book ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `book ${marketPerShare} BDT a share`
        : `no book leaf: ${m.unsourced?.name || listing.exchange}`,
  ].join("; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: { rate: RATE, eachWay: true, currency: CASH },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `no book for ${m.unsourced?.name || listing.exchange}: ${m.unsourced?.why || "no book leaf"}` }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      market: finite(bookUsd, 6),
      commission: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/idlc/idlc_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
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
    const trade = out.trade;
    console.log(
      `${trade.shares} share${trade.shares > 1 ? "s" : ""} at ${trade.price} ${trade.currency} = ${trade.notional.toFixed(2)} ${trade.currency}\n`,
    );
    console.log(`round trip : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`broker fees: ${show(out.brokerFees)} $`);
    const bill = out.parts || {};
    if (bill.market != null) console.log(`  book       : ${bill.market} $`);
    if (bill.commission != null) console.log(`  commission : ${bill.commission} $`);
    if (bill.taxes) console.log(`  taxes      : ${bill.taxes} $`);
  } else if (out.why) {
    console.log(`round trip : N/A — ${out.why}`);
  }
  if (out.confidence) console.log(`\n${out.confidence}`);
}
