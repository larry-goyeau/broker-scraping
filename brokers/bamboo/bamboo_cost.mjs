// What one round trip costs at Bamboo: buy n shares at price p and
// sell them straight back, in dollars.
//
// US securities are provided by DriveWealth LLC, so the US book is
// that firm's Q. The published trade fee is 1.5% a side on the US
// stock markets, minimum $1. An ETF on those markets takes the same
// order. Dividend withholding and the PTP sale tax are not this trip.
// Holding is free. Deposit and withdrawal charges are funding.
// A conversion into dollars is 0.5% (minimum $1, maximum $5). It is
// named in the remark and stays out of the total.
// https://faq.investbamboo.com/en/articles/10068070-charges-fees
//
// A Nigerian Exchange order is Bamboo's 1% plus the statutory card
// the Nigerian page prints. Brokerage is published as 0.75% to 1.35%
// a side. The bill takes 1.35%, and 7.5% VAT on that brokerage.
//
//   https://faq.investbamboo.com/en/articles/3429617-fees-charges-us-stocks
//   https://faq.investbamboo.com/en/articles/9324179-fees-charges-nigerian-stocks
//   https://faq.investbamboo.com/en/articles/6884704-is-bamboo-registered-with-the-sec
//
//   node brokers/bamboo/bamboo_cost.mjs AAPL NASDAQ USD --shares=10 --price=200
//   node brokers/bamboo/bamboo_cost.mjs DANGCEM NGX NGN --shares=10 --price=500
//   node brokers/bamboo/bamboo_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";

const CATALOGUE = new URL("bamboo-parsed.json", import.meta.url);
const US_FEES = "https://faq.investbamboo.com/en/articles/3429617-fees-charges-us-stocks";
const NG_FEES = "https://faq.investbamboo.com/en/articles/9324179-fees-charges-nigerian-stocks";
const READ_ON = "2026-10-14";

const US_RATE = 0.015;
const US_MIN = 1;
const NG_RATE = 0.01;
const BROKERAGE = 0.0135;
const SEC = 0.003;
const NGX = 0.003;
const CSCS = 0.003;
const STAMP = 0.0008;
const ALERT = 4;
const VAT = 0.075;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEX"]);

const SCHEDULE = {
  us: US_FEES,
  ngx: NG_FEES,
  readOn: READ_ON,
  entity: "Bamboo Systems Technology Limited",
  usBroker: "DriveWealth LLC",
  ngxBroker: "Lambeth Capital Limited",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

export function scheduleOf(row, mic) {
  const exchange = loose(row?.exchange);
  const currency = code(row?.currency);
  if (exchange === "NGX" || mic === "XNGN" || currency === "NGN") return { id: "ngx" };
  if (US_MICS.has(mic) || exchange === "US" || currency === "USD") return { id: "us" };
  return null;
}

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
 * `usd` is the number the page prints. `brokerFees` is Bamboo's own
 * 1% twice, and on the Nigerian Exchange the 1.35% brokerage twice
 * with 7.5% VAT on that brokerage. The rest of the statutory card
 * sits beside that.
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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "the Bamboo catalogue is not on disk yet: run `node brokers/bamboo/bamboo_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Bamboo catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Bamboo`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "bamboo",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const schedule = scheduleOf(m.row, listing.mic);
  const ngx = schedule?.id === "ngx";
  const remark = ngx ? "" : fxRemark("0.5", listing.currency, "(min $1, max $5)");
  const shared = {
    ...answer,
    listing,
    feeMarket: schedule?.id || null,
    cashCurrency: listing.currency || null,
    remark,
    url: ngx ? NG_FEES : US_FEES,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
  };
  if (!schedule) return { ...shared, why: `no Bamboo schedule for ${listing.brokerExchange || listing.exchange}` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "no share count" : "no price for this line: run node assets/prices.mjs",
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  let commissionUsd = null;
  let statutoryUsd = null;
  let commission = null;
  if (schedule.id === "us") {
    const side = Math.max(notional * US_RATE, US_MIN);
    commissionUsd = side * 2;
    statutoryUsd = 0;
    commission = { rate: US_RATE, minimum: US_MIN, currency: "USD", buy: side, sell: side, eachWay: true };
  } else {
    const bamboo = notional * NG_RATE;
    const brokerage = notional * BROKERAGE;
    const sec = notional * SEC;
    const ngxFee = notional * NGX;
    const cscs = notional * CSCS;
    const stamp = notional * STAMP * 2;
    const alert = ALERT * 2;
    // Buy VAT is 7.5% of brokerage and the SEC fee. Sell VAT is 7.5% of
    // the NGX fee, the CSCS fee and brokerage. Brokerage is taken at the
    // top of the published range and billed with Bamboo's own 1%.
    const brokerageVat = VAT * brokerage * 2;
    const levyVat = VAT * sec + VAT * (ngxFee + cscs);
    const billed = bamboo * 2 + brokerage * 2 + brokerageVat;
    const statutory = sec + ngxFee + cscs + stamp + alert + levyVat;
    commissionUsd = dollars(billed, listing.currency);
    statutoryUsd = dollars(statutory, listing.currency);
    commission = {
      rate: NG_RATE,
      brokerage: BROKERAGE,
      currency: "NGN",
      buy: bamboo + brokerage,
      sell: bamboo + brokerage,
      eachWay: true,
      statutoryNgn: statutory,
    };
  }

  const parts = bookParts({
    bp: bp ?? book.leaf?.bp ?? null,
    perShare: perShare ?? book.leaf?.perShare ?? null,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => toUsd(amount, listing.currency),
  });
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : parts.a == null || notionalUsd == null || parts.b == null
          ? null
          : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, commissionUsd, statutoryUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    bp: marketBp,
    perShare: marketPerShare,
    basis: schedule.id === "us"
      ? `Bamboo US markets, read on ${READ_ON}: 1.5% a side, minimum $1.`
      : `Bamboo Nigerian stocks, read on ${READ_ON}: 1% a side, brokerage 1.35% a side plus 7.5% VAT on that brokerage, and the printed NGX card.`,
    commission,
    ...(bookUsd == null ? { why: `no order book for ${listing.exchange}` } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(statutoryUsd, 6),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify(SCHEDULE, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/bamboo/bamboo_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 1,
    price: flag("price") ? Number(flag("price")) : 100,
  });
  console.log(JSON.stringify({
    usd: out.usd,
    brokerFees: out.brokerFees,
    feeMarket: out.feeMarket,
    commission: out.commission,
    why: out.why,
    remark: out.remark,
    listing: out.listing,
    bp: out.bp,
    perShare: out.perShare,
  }, null, 2));
}
