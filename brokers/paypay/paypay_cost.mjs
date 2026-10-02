// What one round trip costs at PayPay Securities: buy n shares at price p
// and sell them straight back. The answer is one number in dollars.
// `brokerFees` is what PayPay keeps.
//
// Re-read 2026-10-01.
//
// The customer does not reach the exchange. The order fills at once against
// PayPay. PayPay takes a reference from the Tokyo quote, or from the latest
// US quote, and the customer's price is that reference plus the spread on a
// buy and minus it on a sale. There is no commission beside it, and the
// exchange bid-ask is not this trip.
//
//   Japan, including a reserved order, ETF and REIT
//     0.5% a side, in the session and on the next print
//   United States, cash hours (local 9:30–16:00)
//     0.5% a side
//   United States, any other hour, and a reserved order
//     0.7% a side. That is the remark. This trip is the cash-hour price.
//
// Cash on the account is yen. A dividend arrives in dollars and is converted
// before it is credited. A US trade therefore crosses 0.35 yen per dollar on
// the way in and the same on the way out. That is in the number.
//
//   https://www.paypay-sec.co.jp/service/cost/
//   https://www.paypay-sec.co.jp/stock/rule/
//   https://www.paypay-sec.co.jp/stock/rule/reserve/
//   https://www.paypay-sec.co.jp/us-stock/rule/
//
//   node brokers/paypay/paypay_cost.mjs 7013 XTKS JPY --shares=10 --price=3000
//   node brokers/paypay/paypay_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/paypay/paypay_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey } from "../../spreads/venues.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("paypay-parsed.json", import.meta.url);

const SCHEDULE = {
  cost: "https://www.paypay-sec.co.jp/service/cost/",
  japan: "https://www.paypay-sec.co.jp/stock/rule/",
  reserve: "https://www.paypay-sec.co.jp/stock/rule/reserve/",
  us: "https://www.paypay-sec.co.jp/us-stock/rule/",
  readOn: "2026-10-01",
  entity: "PayPay証券",
};

const LEG = 0.005;
const US_OFF_HOURS = 0.007;
// Yen per dollar, each way, added on a buy and taken off on a sale.
const FX_YEN = 0.35;

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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is what the page prints. `brokerFees` is PayPay's spread and, on a
 * US line, the yen conversion.
 */
export function roundTrip({ etf, place, currency, shares, price }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "JPY" };
  if (!catalogue) {
    return { ...answer, why: "the PayPay catalogue is not written yet: run `node brokers/paypay/paypay_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the PayPay catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at PayPay`,
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
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const america = listing.currency === "USD";
  const japan = listing.currency === "JPY";
  if (!america && !japan) {
    return { ...answer, listing, why: `${listing.currency || "this currency"} has no line on the PayPay card` };
  }

  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    bp: 0,
    perShare: 0,
    remark: america ? "Outside US cash hours the spread is 0.7% a side." : "",
    url: america ? SCHEDULE.us : SCHEDULE.japan,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    tax,
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
  const yenPerDollar = usdPer("JPY");
  const commission = notionalUsd == null ? null : notionalUsd * LEG * 2;
  const fx = america
    ? notionalUsd == null || yenPerDollar == null
      ? null
      : notionalUsd * FX_YEN * 2 * yenPerDollar
    : 0;
  const brokerFees = plus(commission, fx);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    buy: { spread: LEG, ...(america ? { fxYen: FX_YEN } : {}) },
    sell: { spread: LEG, ...(america ? { fxYen: FX_YEN } : {}) },
    parts: {
      market: 0,
      commission: finite(commission, 6),
      fx: finite(fx, 6),
      tax: finite(taxUsd, 6),
    },
    basis: america
      ? `PayPay US ${LEG * 100}% a side in cash hours, plus ${FX_YEN} JPY per USD each way, re-read ${SCHEDULE.readOn}`
      : `PayPay Japan ${LEG * 100}% a side, re-read ${SCHEDULE.readOn}`,
    confidence: america
      ? "principal fill; exchange book not added; 0.7% a side is outside cash hours"
      : "principal fill; exchange book not added; a reserved order uses the same 0.5%",
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
          domestic: { rate: LEG, eachWay: true },
          america: { rate: LEG, offHours: US_OFF_HOURS, eachWay: true, fxYenPerUsd: FX_YEN },
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
    console.error("usage: node brokers/paypay/paypay_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
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
  console.log(`round trip : ${out.usd == null ? `N/A — ${out.why || ""}` : `${out.usd} $`}`);
  console.log(`broker fees: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null && v !== 0) console.log(`  ${name.padEnd(12)}: ${v} $`);
    }
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.basis) console.log(`\n  ${out.basis}`);
  if (out.confidence) console.log(`  ${out.confidence}`);
}
