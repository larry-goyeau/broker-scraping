// What one round trip costs at Air Bank: buy n shares at price p and sell
// them straight back. The answer is one number in dollars. `brokerFees` is
// Air Bank's commission.
//
// Re-read 2026-10-01. The tariff is in force from 2026-09-20.
//
//   Shares    0.2% a side, minimum 2 USD
//   ETFs      0.2% a side, minimum 5 EUR
//   Funds     0
//
// The order goes to Interactive Brokers Ireland, which routes a US share
// to Interactive Brokers LLC, so the US book is that firm's Rule 606.
// Xetra is the ETF book. A Czech fund has no book here, so its total stays
// unknown and the fee is 0.
//
// A dollar account pays a US share, and a euro account an ETF, with no
// conversion. A crown account is converted at the rate in the order. That
// rate is not published, so it is the remark. The Žiju refund of the first
// buy of the month stays out.
//
//   https://www.airbank.cz/file-download/investice-cenik
//   https://www.airbank.cz/file-download/4302-pravidla-provadeni-pokynu.pdf
//
//   node brokers/airbank/airbank_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/airbank/airbank_cost.mjs VWCE XETR EUR --shares=10 --price=140
//   node brokers/airbank/airbank_cost.mjs CZ0008474806 --shares=10 --price=1
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("airbank-parsed.json", import.meta.url);

const SCHEDULE = {
  fees: "https://www.airbank.cz/file-download/investice-cenik",
  orders: "https://www.airbank.cz/file-download/4302-pravidla-provadeni-pokynu.pdf",
  readOn: "2026-10-01",
  feesAsOf: "2026-09-20",
  partner: "Interactive Brokers Ireland Limited",
};

const RATE = 0.002;
const STOCK_MIN = 2;
const ETF_MIN = 5;
const US = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCM"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = loose(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const want = place ? listingKey({ exchange: place, mic: place }) : {};
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || loose(m.row.currency) === wantCurrency);
  return { named, matches };
}

function leg(notional, min) {
  return Math.max(notional * RATE, min);
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is what the page prints. `brokerFees` is the 0.2% commission.
 */
export function roundTrip({ etf, place, currency, shares, price }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true };
  if (!catalogue) {
    return { ...answer, why: "the Air Bank catalogue is not written yet: run `node brokers/airbank/airbank_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Air Bank catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Air Bank`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const fund = String(m.row.type || "").toUpperCase() === "FUND";
  const etfRow = String(m.row.type || "").toUpperCase() === "ETF";
  const mic = m.venue?.mic ?? (US.has(loose(m.row.exchange)) || loose(m.row.exchange) === "XETR" ? loose(m.row.exchange) : null);
  const us = !fund && !etfRow && US.has(mic || "");
  const booked = us || etfRow;
  const book = booked
    ? spreadLeaf(spreads, {
        isin: m.row.isin,
        mic,
        currency: m.row.currency || (etfRow ? "EUR" : "USD"),
        unsourced: m.unsourced,
        broker: "airbank",
        ticker: m.row.ticker,
      })
    : { leaf: null, mic: null };
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: fund ? null : book.mic ?? mic,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || (etfRow ? "EUR" : fund ? "CZK" : "USD")).toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketBp = booked ? leaf?.bp ?? null : null;
  const marketPerShare = booked ? leaf?.perShare ?? null : null;
  const cash = listing.currency;

  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    cashCurrency: cash,
    remark: fund ? "" : fxRemark("", cash),
    url: SCHEDULE.fees,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "no share count" : "no price for this line: run node assets/prices.mjs",
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const min = fund ? 0 : etfRow ? ETF_MIN : STOCK_MIN;
  const local = fund ? 0 : leg(notional, min) * 2;
  const brokerFees = toUsd(local, listing.currency);
  const bookUsd =
    notionalUsd == null
      ? null
      : marketBp != null
        ? (notionalUsd * marketBp) / 1e4
        : marketPerShare != null
          ? marketPerShare * n
          : null;
  const usd = fund ? null : plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null && !fund
      ? { why: `no book for ${m.unsourced?.name || listing.exchange || "this place"}` }
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
      commission: finite(brokerFees, 6),
    },
    basis: fund
      ? `Air Bank funds, re-read ${SCHEDULE.readOn}: 0 to buy and to sell`
      : `Air Bank tariff of ${SCHEDULE.feesAsOf}: 0.2% a side, minimum ${min} ${listing.currency}`,
    confidence: fund
      ? "no book; commission 0"
      : us
        ? "commission 0.2% a side, minimum 2 USD; US book is Interactive Brokers Ireland's 606"
        : "commission 0.2% a side, minimum 5 EUR; Xetra book",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, stockMinUsd: STOCK_MIN, etfMinEur: ETF_MIN, funds: 0 }, null, 2));
    process.exit(0);
  }
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/airbank/airbank_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (!out.listing) {
    console.log(out.why || "nothing to say");
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}, ${l.currency}${l.type ? `, ${l.type}` : ""}\n`);
  console.log(`round trip : ${out.usd == null ? `unknown spread${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`broker fees: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts?.market != null) console.log(`  market       : ${out.parts.market} $`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.basis) console.log(`\n  ${out.basis}`);
  if (out.confidence) console.log(`  ${out.confidence}`);
}
