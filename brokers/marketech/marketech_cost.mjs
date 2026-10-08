// What one round trip costs at Marketech Focus: buy n shares at price p,
// sell them back at once, in dollars. Online order on a paid plan.
// Focus Lite cannot place an order.
//
// Re-read 2026-10-07. The pricing page and the FSG brokerage images
// (July 2026) print the same resident line.
//
//   brokerage      Australian resident: the higher of 0.03% and 5 AUD,
//                  each way, GST included. Above 16,666.66 AUD the
//                  percentage is the higher figure. This row is Marketech AU.
//   non-resident   A resident of New Zealand or Singapore: the higher of
//                  0.04% and 6 AUD. GST is not charged. This row is
//                  Marketech NZ & Singapour.
//   subscription   Plus 20 AUD, Pro 45 AUD or Edge 65 AUD a month. The
//                  remark names the 20 AUD minimum. The TMX data add-on is
//                  another 20 AUD a month and is not required for the
//                  default route.
//   FX             0. Cash is Australian dollars and every line is quoted
//                  in Australian dollars.
//   minimum        500 AUD. A smaller order is refused.
//
// A manual order, accepted by email at Marketech's discretion, is
// 15 AUD or 0.06% for a resident and stays out. Openmarkets' fail fee,
// off-market transfer, SRN search and rebooking stay out.
//
// Openmarkets Australia Limited places and settles the order. It is a
// participant of the ASX, TMX Australia and the NSX. The catalogue has
// no US listing, so no Rule 606 mix is applied.
//
//   https://marketech.com.au/focus/pricing/
//   https://marketech.com.au/financial-services-guide/
//   https://support.marketech.com.au/portal/en-gb/kb/articles/how-is-brokerage-charged-on-my-order
//
//   node brokers/marketech/marketech_cost.mjs VAS ASX AUD --plan=au --shares=10 --price=100
//   node brokers/marketech/marketech_cost.mjs VAS ASX AUD --plan=nzsg --shares=10 --price=100
//   node brokers/marketech/marketech_cost.mjs BHP ASX AUD --shares=1000 --price=40
//   node brokers/marketech/marketech_cost.mjs AEAE "Cboe Australia" AUD --shares=100 --price=10
//   node brokers/marketech/marketech_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("marketech-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://marketech.com.au/focus/pricing/",
  fsg: "https://marketech.com.au/financial-services-guide/",
  readOn: "2026-10-07",
  entity: "Marketech Online Trading Pty Ltd",
  venue: "Openmarkets Australia Limited",
  rule606: null,
};

const CASH = "AUD";
const MIN_ORDER = 500;
const PLANS = {
  au: { id: "au", rate: 0.0003, minimum: 5, gst: "GST included" },
  nzsg: { id: "nzsg", rate: 0.0004, minimum: 6, gst: "GST is not charged" },
};
const DEFAULT_PLAN = "au";

function planOf(name) {
  const id = String(name || DEFAULT_PLAN).trim().toLowerCase();
  if (id === "resident" || id === "australia") return PLANS.au;
  if (id === "nonresident" || id === "nz" || id === "sg" || id === "singapore") return PLANS.nzsg;
  return PLANS[id] || null;
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

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
  const want = place ? listingKey({ exchange: place, mic: place }) : {};
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function leg(notional, plan) {
  return Math.max(notional * plan.rate, plan.minimum);
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan: planName = DEFAULT_PLAN }) {
  const plan = planOf(planName);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: plan?.id ?? planName,
    onlineBuy: true,
    cashCurrency: CASH,
  };
  if (!plan) return { ...answer, why: `unknown plan: ${planName} (au|nzsg)` };
  if (!catalogue) {
    return { ...answer, why: "the Focus catalogue is missing: run `node brokers/marketech/marketech_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Focus catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Focus`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "marketech",
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
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    remark: "Minimum subscription 20 AUD/month",
    url: SCHEDULE.url,
    basis: `Focus tariff, re-read ${SCHEDULE.readOn}: the higher of ${(plan.rate * 100).toFixed(2)}% and ${plan.minimum} AUD per order`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "no number of shares" : "no price for this line: run node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const trade = {
    shares: n,
    price: p,
    notional,
    notionalUsd: finite(notionalUsd, 6),
    currency: listing.currency,
  };
  const ticketAud = leg(notional, plan) * 2;
  const commissionUsd = dollars(ticketAud, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    plan.gst,
    "subscription is not in the number",
    "quoted in AUD: no FX",
    "no US broker-dealer",
    marketBp != null
      ? `book ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `book ${marketPerShare} $ per share`
        : `no book: ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: { rate: plan.rate, minimum: plan.minimum, currency: CASH, eachWay: true, plan: plan.id },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: `no book for ${m.unsourced?.name || listing.exchange}: ${m.unsourced?.why || "no book on file"}`,
        }
      : {}),
    trade,
    parts: {
      market: finite(bookUsd, 6),
      brokerage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          cash: CASH,
          brokerage: "au: max(0.03%, 5 AUD); nzsg: max(0.04%, 6 AUD), each way",
          minimumOrder: MIN_ORDER,
          subscription: "Plus 20 / Pro 45 / Edge 65 AUD a month, not in the number",
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/marketech/marketech_cost.mjs <ticker|ISIN> [venue] [currency] [--plan=au|nzsg] [--shares=n] [--price=p]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    plan: flag("plan") || DEFAULT_PLAN,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} share${t.shares > 1 ? "s" : ""} at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip  : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`broker fees : ${show(out.brokerFees)} $`);
  } else if (out.why) {
    console.log(`round trip  : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
