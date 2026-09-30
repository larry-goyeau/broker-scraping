// What one round trip costs at Freetrade: buy n shares at price p, sell them
// back at once, in dollars.
//
// Three plans, re-read 2026-09-27 on the plan comparison and the account
// article of 27 Feb 2026. Default is Basic, the free plan. The front calls
// roundTrip with no plan, so that is the row it prints.
//
//   Basic      £0. Commission 0. FX 0.99% on a non-GBP line.
//   Standard   £5.99 a month, or £59.88 a year. Commission 0. FX 0.59%.
//   Plus       £11.99 a month, or £119.88 a year. Commission 0. FX 0.39%.
//
// The subscription is not a trade fee and stays out of the number. The
// comparison's own worked example is one US trade of £250 a month on Basic
// costing £29.70 a year of FX, which is 0.99% of £250 twelve times. So the
// fee is once per order. A round trip converts twice, because the account
// takes pounds and a foreign line is changed on the way in and on the way out.
// A GBP line does not convert.
//
// Stamp duty is the tax map, not a Freetrade ticket. Their help says 0.5%
// on the purchase of a UK share, and not on the sale, not on an ETF, not on
// AIM, and not on a non-UK line. No US regulatory levy is named.
//
//   https://freetrade.io/compare-plans
//   https://help.freetrade.io/en/articles/1771978-what-types-of-account-do-you-offer
//
//   node brokers/freetrade/freetrade_cost.mjs HSBA --shares=10 --price=10
//   node brokers/freetrade/freetrade_cost.mjs AAPL --shares=1 --price=230
//   node brokers/freetrade/freetrade_cost.mjs AAPL --plan=plus --shares=1 --price=230
//   node brokers/freetrade/freetrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("freetrade-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);

const SCHEDULE = {
  url: "https://freetrade.io/compare-plans",
  readOn: "2026-09-27",
  entity: "Freetrade",
};

const DEFAULT_PLAN = "basic";
const CASH = "GBP";

const PLANS = {
  basic: { id: "basic", label: "Freetrade Basic", fx: 0.0099, subscription: null },
  standard: {
    id: "standard",
    label: "Freetrade Standard",
    fx: 0.0059,
    subscription: "£5.99/month",
  },
  plus: {
    id: "plus",
    label: "Freetrade Plus",
    fx: 0.0039,
    subscription: "£11.99/month",
  },
};

const PLAN_ALIAS = { basic: "basic", standard: "standard", std: "standard", plus: "plus" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
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

function taxParts(isin) {
  const tax = taxesOf(isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  return { tax, taxTotal };
}

function remarkOf(plan) {
  return plan.subscription || "";
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the FX, the commission
 * being zero on every plan.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: "",
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (basic|standard|plus)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Freetrade n'existe pas encore : lancer `node brokers/freetrade/freetrade_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Freetrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Freetrade`,
      alternatives: named
        .slice(0, 8)
        .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "freetrade",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? (String(m.row.exchange || "").toUpperCase() || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const holdGbp = listing.currency === CASH;
  const { tax, taxTotal } = taxParts(listing.isin);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    cashCurrency: holdGbp ? CASH : "",
    remark: remarkOf(picked),
    bp: marketBp,
    perShare: marketPerShare,
    url: SCHEDULE.url,
    basis: `barème ${picked.label}, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? dollars(marketPerShare * n, listing.currency)
        : null;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const fxUsd = holdGbp || notionalUsd == null ? 0 : notionalUsd * picked.fx * 2;
  const usd = plus(bookUsd, 0, taxUsd, fxUsd);
  const brokerFees = plus(0, fxUsd);

  const confidence = [
    `barème ${picked.label}, relu le ${SCHEDULE.readOn}`,
    "exécution 0",
    holdGbp ? "ligne en GBP : pas de change" : `change ${(picked.fx * 100).toFixed(2)} % × 2, dans le total`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { rate: 0, min: 0, flat: 0, currency: CASH, eachWay: true, plan: picked.id },
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: 0,
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, defaultPlan: DEFAULT_PLAN, plans: PLANS, cash: CASH }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node brokers/freetrade/freetrade_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=basic|standard|plus]"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}  [${out.plan}]\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
