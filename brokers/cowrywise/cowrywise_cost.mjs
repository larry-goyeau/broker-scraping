// What one round trip costs at Cowrywise: buy n shares at price p and sell
// them straight back. The answer is one number in dollars. `brokerFees` is
// the part of the NGX card that has a single rate.
//
// Re-read 2026-10-01.
//
// The order goes to Meristem and onto the Nigerian Exchange. Cowrywise names
// stamp duty, brokerage, VAT, the SEC fee, a processing fee and the trade
// alert, and prints no rate. The exchange does:
//
//   Buy     SEC 0.3%, stamp duty 0.08%, trade alert ₦4
//           VAT 7.5% of the SEC fee
//   Sell    NGX 0.3%, CSCS 0.3%, stamp duty 0.08%, trade alert ₦4
//           VAT 7.5% of the NGX and CSCS fees
//   Both    brokerage 0.75–1.35%, and VAT on that brokerage
//
// The brokerage is a range, and Cowrywise does not say where it sits. The
// processing fee is not on the exchange card. Neither is in the number.
// The 10% buffer is returned, so it is not a fee. The fixed NGX card sits
// in the round trip. There is no Lagos book here, so the total stays
// unknown until one is stored. Cash is naira.
//
//   https://cowrywise.com/blog/how-to-invest-nigerian-stocks-cowrywise-10000-naira/
//   https://ngxgroup.com/exchange/trade/equities/trading-market-structure/
//
//   node brokers/cowrywise/cowrywise_cost.mjs GTCO NSENG NGN --shares=10 --price=132
//   node brokers/cowrywise/cowrywise_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("cowrywise-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);

const SCHEDULE = {
  fees: "https://ngxgroup.com/exchange/trade/equities/trading-market-structure/",
  names: "https://cowrywise.com/blog/how-to-invest-nigerian-stocks-cowrywise-10000-naira/",
  readOn: "2026-10-01",
  entity: "CFTL Digital Services Limited",
  broker: "Meristem Stockbrokers Limited",
};

const SEC = 0.003;
const NGX = 0.003;
const CSCS = 0.003;
const STAMP = 0.0008;
const ALERT = 4;
const VAT = 0.075;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the book plus the fixed NGX card. `brokerFees` is that card,
 * not the brokerage range. With no Lagos book the total stays unknown.
 */
export function roundTrip({ etf, place, currency, shares, price }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "NGN" };
  if (!catalogue) {
    return { ...answer, why: "the Cowrywise catalogue is not written yet: run `node brokers/cowrywise/cowrywise_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Cowrywise catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Cowrywise`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "NGN").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const shared = {
    ...answer,
    listing,
    remark: "Brokerage is 0.75–1.35% a side, plus VAT on it. Cowrywise names a processing fee and prints no rate.",
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
  const sec = notional * SEC;
  const ngx = notional * NGX;
  const cscs = notional * CSCS;
  const stamp = notional * STAMP * 2;
  const alert = ALERT * 2;
  const vat = VAT * sec + VAT * (ngx + cscs);
  const local = sec + ngx + cscs + stamp + alert + vat;
  const brokerFees = toUsd(local, listing.currency);
  const notionalUsd = toUsd(notional, listing.currency);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: listing.currency,
    unsourced: m.unsourced,
    broker: "cowrywise",
    ticker: m.row.ticker,
  });
  const parts = bookParts({
    bp: book.leaf?.bp ?? null,
    perShare: book.leaf?.perShare ?? null,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => toUsd(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: book.leaf?.bp ?? null,
    perShare: book.leaf?.perShare ?? null,
    ...(usd == null
      ? {
          why:
            bookUsd == null
              ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
              : `no dollar rate for ${listing.currency}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(toUsd(notional, listing.currency), 6),
      currency: listing.currency,
    },
    buy: { sec, stamp: notional * STAMP, alert: ALERT, vat: VAT * sec },
    sell: { ngx, cscs, stamp: notional * STAMP, alert: ALERT, vat: VAT * (ngx + cscs) },
    parts: {
      market: finite(bookUsd, 6),
      statutory: finite(brokerFees, 6),
      statutoryNgn: finite(local, 6),
    },
    basis: `NGX equities card, re-read ${SCHEDULE.readOn}: SEC, NGX, CSCS, stamp duty and the ₦4 alert. Brokerage is a range.`,
    confidence:
      bookUsd == null
        ? "NGX card is in the round trip; no Lagos book is stored, so the total stays unknown. Brokerage is a range and the processing fee has no rate."
        : "NGX card plus the stored Lagos book. Brokerage is a range and the processing fee has no rate.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, sec: SEC, ngx: NGX, cscs: CSCS, stamp: STAMP, alertNgn: ALERT, vat: VAT }, null, 2));
    process.exit(0);
  }
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/cowrywise/cowrywise_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
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
  console.log(`round trip : ${out.usd == null ? "unknown spread" : `${out.usd} $`}`);
  console.log(`broker fees: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts?.statutoryNgn != null) console.log(`  statutory    : ${out.parts.statutoryNgn} NGN`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.basis) console.log(`\n  ${out.basis}`);
  if (out.confidence) console.log(`  ${out.confidence}`);
}
