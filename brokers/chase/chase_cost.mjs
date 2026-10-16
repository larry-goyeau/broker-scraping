// What one round trip costs at Chase Securities: buy n shares at price p,
// sell them back at once, in dollars. Online. The phone stays out.
// Custody stays out.
//
// Chase's own site prints no rate. Nafa, the app on a Chase account,
// does. Ticker Analysts, the same company, says Nafa charges 0.15 %,
// the minimum of the band, and then prints every other line on a
// Rs 100,000 buy in Sindh. This trip uses that bill. A higher commission,
// up to 2.5 %, stays out. The other provinces in the article stay out:
// the printed example is Sindh at 13 %. A fixed-income ETF keeps the
// lower floor from the annex, which Nafa does not restate.
//
//   https://www.tickeranalysts.com/blog/psx-trading-fees-charges-explained
//   https://www.psx.com.pk/psx/themes/psx/uploads/PSX-Rulebook-August-27-2025.pdf
//
//   Ready market, each way                 max(3 paisa a share, 0.15 %).
//   Fixed-income ETF, each way             max(1 paisa a share, 0.01 %).
//   Sindh sales tax                        13 % of the commission and of the PSX trading fee.
//   PSX trading fee                        Rs 3.50 per Rs 100,000.
//   PSX regulatory fee                     Rs 0.62 per Rs 100,000.
//   SECP levy                              0.00065 % of the value.
//   NCCPL trade fee                        Rs 0.81 per Rs 100,000.
//   NCCPL SECP fee                         Rs 0.30 per Rs 100,000.
//   CDC                                    0.0036 % of the value, at least Rs 5, at most Rs 25,000.
//
// This trip is not squared the same day, so every line is charged twice.
// A same-day square pays the commission, and the sales tax on it, once.
// The remark states how many dollars that saves.
//
//   node brokers/chase/chase_cost.mjs OGDC PSX PKR --shares=100 --price=250
//   node brokers/chase/chase_cost.mjs MIIETF PSX PKR --shares=100 --price=12
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("chase-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.tickeranalysts.com/blog/psx-trading-fees-charges-explained",
  readOn: "2026-07-22",
};

const RATE = 0.0015;
const PAISA = 0.03;
const FIXED_RATE = 0.0001;
const FIXED_PAISA = 0.01;
const CASH = "PKR";
const SST = 0.13;
const PER = 100_000;
const PSX_TRADE = 3.5 / PER;
const PSX_REG = 0.62 / PER;
const SECP = 0.0000065;
const NCCPL = 0.81 / PER;
const NCCPL_SECP = 0.3 / PER;
const CDC = 0.000036;
const CDC_MIN = 5;
const CDC_MAX = 25_000;

const paisa = (amount) => Math.round(amount * 100) / 100;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function fixedIncome(name) {
  return /treasury|fixed income/i.test(name || "");
}

function side(notional, shares, treasury) {
  if (treasury) return Math.max(shares * FIXED_PAISA, notional * FIXED_RATE);
  return Math.max(shares * PAISA, notional * RATE);
}

function leg(notional, shares, treasury) {
  const commission = paisa(side(notional, shares, treasury));
  const psxTrade = paisa(notional * PSX_TRADE);
  const psxReg = paisa(notional * PSX_REG);
  const secp = paisa(notional * SECP);
  const nccpl = paisa(notional * NCCPL);
  const nccplSecp = paisa(notional * NCCPL_SECP);
  const cdc = paisa(Math.min(CDC_MAX, Math.max(CDC_MIN, notional * CDC)));
  const salesTax = paisa(paisa(SST * commission) + paisa(SST * psxTrade));
  const levies = paisa(psxTrade + psxReg + secp + nccpl + nccplSecp + cdc);
  return { commission, salesTax, levies, total: paisa(commission + salesTax + levies) };
}

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
 * `usd` is the number the page prints. `brokerFees` is the Chase ticket.
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
    return { ...answer, why: "the Chase catalogue is not there yet: run `node brokers/chase/chase_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Chase catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Chase`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "chase",
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
  const treasury = fixedIncome(listing.name);
  const shared = {
    ...answer,
    listing,
    remark: "",
    url: SCHEDULE.url,
    basis: treasury
      ? "Nafa's bill, fixed-income ETF floor max(1 paisa, 0.01%) each way, plus the Sindh lines printed on 22 July 2026"
      : "Nafa's bill, 0.15% each way (3 paisa a share when that is more), plus the Sindh lines printed on 22 July 2026",
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
  const one = leg(notional, n, treasury);
  const saved = paisa(one.commission + paisa(SST * one.commission));
  const savedUsd = dollars(saved, CASH);
  const savedText = savedUsd == null ? null : Number(savedUsd).toFixed(2);
  const ticket = paisa(one.total * 2);
  const brokerage = paisa(one.commission * 2);
  const levy = paisa((one.salesTax + one.levies) * 2);
  const commissionUsd = dollars(ticket, CASH);
  const brokerageUsd = dollars(brokerage, CASH);
  const levyUsd = dollars(levy, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    "Sindh sales tax 13% on the commission and on the PSX trading fee",
    "PSX, SECP, NCCPL and CDC as printed for a Rs 100,000 buy",
    "a higher commission, up to 2.5%, stays out",
    "phone and custody stay out",
    "PKR line: no foreign exchange",
    marketBp != null
      ? `book ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `book ${marketPerShare} PKR a share`
        : `no book leaf: ${m.unsourced?.name || listing.exchange}`,
  ].join("; ");

  return {
    ...shared,
    remark: savedText == null ? "" : `Buy and sell the same day costs $${savedText} less.`,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: {
      rate: treasury ? FIXED_RATE : RATE,
      perShare: treasury ? FIXED_PAISA : PAISA,
      eachWay: true,
      currency: CASH,
    },
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
      commission: finite(brokerageUsd, 6),
      taxes: finite(plus(levyUsd, taxUsd), 6),
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
    console.error("usage: node brokers/chase/chase_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
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
