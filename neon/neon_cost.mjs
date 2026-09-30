// What one round trip costs at neon invest: buy n shares at price p,
// sell them back at once, in dollars.
//
// neon Switzerland AG is the app. The account and the custody are
// Hypothekarbank Lenzburg AG, which is the BX Swiss trading participant.
// There is no US broker-dealer. A US share is a BX Swiss line, dealt in
// francs. The home market is not where the order goes.
//
//   https://www.neon-free.ch/en/faq/where-are-my-investments-traded
//   https://www.neon-free.ch/en/faq/what-fees-do-i-pay-when-i-invest
//   https://static-assets.neon-free.ch/legal/Prices/neon_services_and_prices_EN.pdf
//
// Re-read 2026-09-30.
//
//   Swiss shares and every ETF     0.50 % a side
//   international shares           1.00 % a side
//   ETP (crypto, tracker)          0.50 % a side — not the international-share line
//   minimum                        1 CHF a side, outside the investment plan
//   Swiss stamp                    0.075 % a side on Swiss shares and every ETF
//                                  0.150 % a side on other foreign securities
//   custody                        0
//   FX                             0 — the BX Swiss price is already in CHF
//
// The investment plan drops the 1 CHF minimum on every line. Twenty-two
// lines marked on the public list also pay no commission on the buy.
// The sell stays on the card. Stamp is unchanged. Pillar 3a is
// Swisscanto funds at another foundation and is not this catalogue.
//
//   node neon/neon_cost.mjs US0378331005 --shares=1 --price=180
//   node neon/neon_cost.mjs CH0038863350 --shares=1 --price=80
//   node neon/neon_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("neon-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  fees: "https://www.neon-free.ch/en/faq/what-fees-do-i-pay-when-i-invest",
  venue: "https://www.neon-free.ch/en/faq/where-are-my-investments-traded",
  prices: "https://static-assets.neon-free.ch/legal/Prices/neon_services_and_prices_EN.pdf",
  readOn: "2026-09-30",
  entity: "neon Switzerland AG",
  bank: "Hypothekarbank Lenzburg AG",
  usBrokerDealer: null,
};

const SWISS_RATE = 0.005;
const FOREIGN_SHARE_RATE = 0.01;
const MIN_CHF = 1;
const STAMP_SWISS = 0.00075;
const STAMP_FOREIGN = 0.0015;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

// Swiss shares and every ETF take 0.50 % and the 0.075 % stamp. An
// international share takes 1 % and the 0.150 % stamp. An ETP is not
// that share line, so it takes 0.50 %; its stamp follows the issuer.
export function scheduleOf(row) {
  const type = String(row?.type || "").toUpperCase();
  const swiss = String(row?.isin || "").toUpperCase().startsWith("CH");
  if (type === "ETF") return { id: "etf", rate: SWISS_RATE, stamp: STAMP_SWISS };
  if (type === "ETP") return { id: "etp", rate: SWISS_RATE, stamp: swiss ? STAMP_SWISS : STAMP_FOREIGN };
  if (type === "STOCK" && swiss) return { id: "swiss-share", rate: SWISS_RATE, stamp: STAMP_SWISS };
  if (type === "STOCK") return { id: "international-share", rate: FOREIGN_SHARE_RATE, stamp: STAMP_FOREIGN };
  return null;
}

export function feeMarketOf(row) {
  return scheduleOf(row)?.id || null;
}

export function commissionSide(notional, rule) {
  if (!rule || !(Number(notional) > 0)) return null;
  return Math.max(MIN_CHF, Number(notional) * rule.rate);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? listingKey({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is neon's commission,
 * twice, including the CHF 1 floor when it bites.
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
    cashCurrency: "CHF",
  };

  if (!catalogue) {
    return { ...answer, why: "the neon catalogue is not here yet: run `node neon/neon_scraping.mjs`" };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the neon catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at neon`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "CHF"} @ ${r.exchange || "BX Swiss"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "neon",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name || m.unsourced?.name || m.row.exchange,
    currency: String(m.row.currency || "CHF").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const rule = scheduleOf(m.row);
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    feeMarket: rule?.id || null,
    bp: marketBp,
    perShare: marketPerShare,
    url: SCHEDULE.fees,
    basis: `neon invest schedule, read on ${SCHEDULE.readOn}`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
  };

  if (!rule) return { ...shared, why: `no neon schedule for ${listing.type || listing.ticker}` };

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "no share count" : "no price for this line: run node prices.mjs",
    };
  }

  const sell = commissionSide(notional, rule);
  const buy = m.row.planFree ? 0 : sell;
  const brokerFees = dollars(buy + sell, "CHF");
  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const stampUsd = notionalUsd == null ? null : notionalUsd * rule.stamp * 2;
  const mapTaxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, stampUsd, mapTaxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `no book for ${listing.exchange}: ${m.unsourced?.why || "no book page"}` }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    commission: {
      rate: rule.rate,
      min: MIN_CHF,
      stamp: rule.stamp,
      currency: "CHF",
      buy,
      sell,
      eachWay: buy === sell,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(plus(stampUsd, mapTaxUsd), 6),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify(SCHEDULE, null, 2));
    process.exit(0);
  }

  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error(
      "usage: node neon/neon_cost.mjs <isin> [venue] [currency] [--shares=n] [--price=p]\n" +
        "       node neon/neon_cost.mjs --schedule"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 1,
    price: flag("price") ? Number(flag("price")) : 100,
  });
  console.log(JSON.stringify({ usd: out.usd, brokerFees: out.brokerFees, feeMarket: out.feeMarket, commission: out.commission, why: out.why, listing: out.listing }, null, 2));
}
