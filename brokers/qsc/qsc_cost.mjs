// What one round trip costs at Qatar Securities Company: buy n shares at
// price p, sell them back at once, in dollars. Qatar Stock Exchange shares
// and the two QSE funds, in riyals, through the online (E-Trade) account.
// Debt instruments are another board and stay out. The international
// brokerage service is not this catalogue.
//
// Read on 2026-10-18. The FAQ page (https://qatar-securities.com/faq/)
// now answers 404, and no page of the site prints a rate. The individual
// account-opening application says the client shall "pay all commissions
// set by regulatory authorities for sale and purchase operations in
// accordance with the internal regulations of Qatar Exchange and/or Qatar
// Financial Markets Authority". The commission is therefore the exchange's
// published one, and that is the figure:
//   https://qsc.expert.com.qa/wp-content/uploads/2026/02/trading-acount-opening-application-form-individual_compressed.pdf
//   https://qatar-securities.com/en/application-forms/
//
//   Commission           0.275 % of the traded value, each side, no minimum.
//                        QSE removed the 30-riyal minimum from Sunday
//                        16 March 2025, "replacing it with a fixed
//                        proportional commission rate of 0.00275 with no
//                        minimum threshold". Every QSE broker charges that
//                        rate, and the exchange's share is inside it.
//                        https://qna.org.qa/en/News-Area/News/2025-3/6/qse-to-remove-minimum-trading-commission-effective-march-16
//   Additional services  "Any fees or other expenses for the additional
//                        services" are not priced and are not this order.
//   Taxes                Qatar has no VAT, no stamp duty and no transaction
//                        tax on a listed share. None is added.
//
// The book: venues.mjs has no Qatar Stock Exchange yet, so a QSC line does
// not resolve to a venue and there is no bid and ask to read. `usd` is then
// N/A and `why` says the QSE book is missing; `brokerFees` is still the
// commission. The two funds carry no ISIN in the feed.
//
// The account is in riyals and the lines are in riyals: no conversion on
// the ticket.
//
//   node brokers/qsc/qsc_cost.mjs BEMA DSMD QAR --shares=1000 --price=4.898
//   node brokers/qsc/qsc_cost.mjs AHCS DSMD QAR --shares=10 --price=0.678
//   node brokers/qsc/qsc_cost.mjs QETF DSMD QAR --shares=500 --price=11
//   node brokers/qsc/qsc_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("qsc-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://qatar-securities.com/en/application-forms/",
  agreement: "https://qsc.expert.com.qa/wp-content/uploads/2026/02/trading-acount-opening-application-form-individual_compressed.pdf",
  exchange: "https://qna.org.qa/en/News-Area/News/2025-3/6/qse-to-remove-minimum-trading-commission-effective-march-16",
  readOn: "2026-10-18",
  noMinimumFrom: "2025-03-16",
  entity: "Qatar Securities Company Q.P.S.C.",
};

const RATE = 0.00275;
const PCT = "0.275";
const REMARK = "";
const QSE = "Qatar Stock Exchange";

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
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter(
      (m) =>
        !wantPlace ||
        loose(m.row.exchange) === wantPlace ||
        loose(m.row.mic) === wantPlace ||
        ["QSE", "QE", "QATAR", "XQAT"].includes(wantPlace)
    )
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
    cashCurrency: "QAR",
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "the QSC catalogue is not here yet: run `node brokers/qsc/qsc_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the QSC catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at QSC`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "qsc",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? QSE,
    currency: code(m.row.currency) || "QAR",
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    venueAuthoritative: false,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `QSE ${PCT}% each side, no minimum since ${SCHEDULE.noMinimumFrom}; QSC agreement read on ${SCHEDULE.readOn}`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "no share count" : "no price for this line: run node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * RATE;
  const brokerFees = dollars(each * 2, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const bookWhy = m.venue
    ? `no book for ${listing.exchange}: ${m.unsourced?.why || "no leaf for this line"}`
    : `no book for ${QSE}: Qatar is not in spreads/venues.mjs, so the line does not resolve to a venue`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null ? { why: bookWhy } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    commission: { rate: RATE, min: 0, each, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      `${PCT}% of ${notional.toFixed(2)} ${listing.currency} = ${each.toFixed(4)} ${listing.currency} a side`,
      marketPerShare != null
        ? `book ${marketPerShare} a share`
        : marketBp != null
          ? `book ${marketBp} bp`
          : `no book leaf: ${listing.exchange}`,
    ]
      .filter(Boolean)
      .join(" ; "),
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
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, min: 0, currency: "QAR", eachWay: true }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/qsc/qsc_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip       : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`broker fees      : ${out.brokerFees ?? "N/A"} $`);
    for (const [name, v] of Object.entries(out.parts || {})) if (v) console.log(`  ${name.padEnd(15)}: ${v} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
