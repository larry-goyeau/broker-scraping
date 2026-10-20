// What one round trip costs at Al Sharq Financial Brokerage: buy n shares at
// price p, sell them back at once, in dollars. Boursa Kuwait shares, in
// dinars, through the Sharq e-Trade account. Sukuk, bonds and OTC lines
// stay out.
//
// Read on 2026-10-18. "Newly Restructured Trading Commission" ("هيكل رسوم
// عمولات التداول الجديدة"): "Implementation of the new Trading Commissions
// fee structure on 4 October 2026". The table is an image on that page,
// "Trading Fees In the Market"; Boursa Kuwait's supplementary disclosure of
// 22/09/2026, on the same page, moves the start from 1 to 4 October 2026.
//   https://www.sharqetrade.com/en/news--events/newly-restructured-trading-commission
//
//   Commission           0.0015 of the deal (0.15 %), the same on the Premier
//                        Market, the Main Market and REITs, each side.
//   Minimum              500 fils (0.5 KWD) per deal, which is what a deal
//                        under 333.33 KWD pays. The commission is "calculated
//                        for each trade separated" at the end of the session:
//                        an order filled in several trades pays the minimum
//                        on each small fill. The figure is one fill each way.
//   Ticket               The 500-fils fee formerly charged on every deal over
//                        50 KWD is cancelled ("تم إلغاء رسوم (البون) 500
//                        فلس"). Nothing is added for it.
//   Taxes                Kuwait has no VAT and no stamp or transaction tax
//                        on a listed share. None is added.
//
// The Auction market is not in the table; the catalogue does not say which
// board a share is on, and the three boards it names share one rate.
//
// FX: fx.mjs has no dinar ("Kuwait floats on a basket and is not in this
// table"), so this file carries its own rate, for the same day as fx.mjs:
// 0.30902359 KWD per USD on 2026-09-07, the currency-api print fx.mjs
// already uses for TWD. The account and the lines are in dinars, so there
// is no conversion on the ticket. A price is in dinars, not fils.
//   https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-07/v1/currencies/usd.min.json
//
// The book is Boursa Kuwait's touch (spreads/kw-touch.json), by ISIN. The
// one line with no ISIN has no book. Custody, KCC registration and
// dividend collection are not this order.
//
//   node brokers/sharq/sharq_cost.mjs NBK XKUW KWD --shares=1000 --price=0.815
//   node brokers/sharq/sharq_cost.mjs KFH XKUW KWD --shares=200 --price=0.762
//   node brokers/sharq/sharq_cost.mjs AAYAN XKUW KWD --shares=10000 --price=0.280
//   node brokers/sharq/sharq_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd as fxToUsd, usdPer as fxUsdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("sharq-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.sharqetrade.com/en/news--events/newly-restructured-trading-commission",
  readOn: "2026-10-18",
  inForce: "2026-10-04",
  entity: "Al Sharq Financial Brokerage Co. K.S.C.C.",
};

const RATE = 0.0015;
const MIN_KWD = 0.5;
const REMARK = "";

// Dinars per dollar, 2026-09-07 (fx.mjs AS_OF), not in fx.mjs.
const KWD_PER_USD = 0.30902359;
const KWD_SOURCE = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-07/v1/currencies/usd.min.json";

const usdPer = (currency) => (String(currency || "").toUpperCase() === "KWD" ? 1 / KWD_PER_USD : fxUsdPer(currency));
const toUsd = (amount, currency) => {
  if (String(currency || "").toUpperCase() !== "KWD") return fxToUsd(amount, currency);
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  return Number(amount) / KWD_PER_USD;
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One deal: 0.15 %, at least 500 fils.
const side = (notional) => Math.max(notional * RATE, MIN_KWD);

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
        ["KSE", "KUWAIT", "BOURSA"].includes(wantPlace)
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
    cashCurrency: "KWD",
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "the Sharq catalogue is not here yet: run `node brokers/sharq/sharq_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Sharq catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Sharq`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sharq",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || "KWD",
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
    venueAuthoritative: true,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `Sharq table in force from ${SCHEDULE.inForce}, read on ${SCHEDULE.readOn}: 0.15% a deal, minimum 500 fils, each side`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), source: KWD_SOURCE },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "no share count" : "no price for this line: run node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = side(notional);
  const brokerFees = dollars(each * 2, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const floorBites = notional * RATE < MIN_KWD;
  const bookWhy = !listing.isin
    ? `no ISIN: the ${listing.exchange} book cannot be read`
    : `no book for ${listing.exchange}: ${m.unsourced?.why || "no touch for this line"}`;

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
    commission: { rate: RATE, min: MIN_KWD, each, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      floorBites
        ? `the 500-fils minimum bites under ${(MIN_KWD / RATE).toFixed(2)} KWD a deal`
        : `0.15% of ${notional.toFixed(3)} KWD = ${each.toFixed(3)} KWD a side`,
      `KWD at ${KWD_PER_USD} per USD on ${FX_AS_OF}, local to this file`,
      marketPerShare != null
        ? `book ${marketPerShare} a share`
        : marketBp != null
          ? `Boursa Kuwait touch ${marketBp} bp`
          : `no book leaf: ${listing.exchange}`,
    ].join(" ; "),
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, minKwd: MIN_KWD, eachWay: true, kwdPerUsd: KWD_PER_USD, kwdSource: KWD_SOURCE }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/sharq/sharq_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
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
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(3)} ${t.currency}\n`);
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
