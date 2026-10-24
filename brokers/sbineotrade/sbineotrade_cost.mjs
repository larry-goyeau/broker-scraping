// What one round trip costs at SBI Neotrade Securities (SBIネオトレード証券):
// buy n shares at price p, sell them back at once, in dollars. Online cash
// orders (NEOTRADE W and the apps). Margin, phone orders (コール取引) and
// odd-lot sales stay out. The old スタンダード・コース (495 ¥ an order) is
// closed to new clients and stays out.
//
// Read 2026-10-23.
//
// Two commission plans, chosen by the client and changeable at any time, so
// there are two plans (`plan`):
//   flat   一律プラン, one fee for each order. The default.
//   daily  定額プラン, one fee for the day's cash executions
//          ("1日の約定代金合計額に応じた手数料体系").
//
//   Tokyo, cash, tax included
//     flat, one order                     daily, the day's buys and sells
//       up to 50 000 ¥        50 ¥          up to 1 000 000 ¥        0
//       up to 100 000 ¥       88 ¥          up to 1 500 000 ¥      880 ¥
//       up to 200 000 ¥      100 ¥          up to 2 000 000 ¥    1 100 ¥
//       up to 500 000 ¥      198 ¥          up to 3 000 000 ¥    1 540 ¥
//       up to 1 000 000 ¥    374 ¥          then 295 ¥ each further
//       up to 1 500 000 ¥    440 ¥          1 000 000 ¥ ("以降100万円増加ごとに
//       up to 3 000 000 ¥    660 ¥          295円ずつ増加")
//       above                880 ¥
//
// The round trip is bought and sold the same day, so on the daily plan the
// day's amount is the buy and the sale together (as matsui_cost.mjs does).
// Prior turnover that day is unknown, so the day is this trip only.
//
// Cash is yen only (deposits.mjs) and every catalogue line is a Tokyo
// listing in yen, so there is no conversion. Japan has no stamp; the tax map
// is read by ISIN all the same.
//
//   https://www.sbineotrade.jp/stock/fee/
//
//   node brokers/sbineotrade/sbineotrade_cost.mjs 1306 Tokyo JPY --shares=50 --price=3000
//   node brokers/sbineotrade/sbineotrade_cost.mjs 7203 Tokyo JPY --shares=500 --price=3000 --plan=daily
//   node brokers/sbineotrade/sbineotrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("sbineotrade-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.sbineotrade.jp/stock/fee/",
  readOn: "2026-10-23",
  entity: "SBIネオトレード証券",
};

export const PLANS = [
  { id: "flat", label: "一律プラン", name: "per-order plan" },
  { id: "daily", label: "定額プラン", name: "daily flat plan" },
];
const DEFAULT_PLAN = "flat";

// Tax included: [upper bound in yen, fee in yen].
const PER_ORDER = [
  [50_000, 50],
  [100_000, 88],
  [200_000, 100],
  [500_000, 198],
  [1_000_000, 374],
  [1_500_000, 440],
  [3_000_000, 660],
];
const PER_ORDER_TOP = 880;
const DAILY = [
  [1_000_000, 0],
  [1_500_000, 880],
  [2_000_000, 1_100],
  [3_000_000, 1_540],
];
const DAILY_STEP = 1_000_000;
const DAILY_ADD = 295;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

export function planOf(id = DEFAULT_PLAN) {
  return PLANS.find((p) => p.id === String(id || DEFAULT_PLAN).toLowerCase()) || null;
}

function perOrderYen(notional) {
  if (!(notional > 0)) return null;
  for (const [upTo, fee] of PER_ORDER) if (notional <= upTo) return fee;
  return PER_ORDER_TOP;
}

function dailyYen(day) {
  if (!(day > 0)) return null;
  for (const [upTo, fee] of DAILY) if (day <= upTo) return fee;
  const [top, topFee] = DAILY[DAILY.length - 1];
  return topFee + DAILY_ADD * Math.ceil((day - top) / DAILY_STEP - 1e-12);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
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
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
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
    remark: "",
    url: SCHEDULE.url,
  };
  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (${PLANS.map((p) => p.id).join("|")})` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue ネオトレ n'existe pas encore : lancer `node brokers/sbineotrade/sbineotrade_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ネオトレ` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ネオトレ`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sbineotrade",
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
  const tokyo = loose(listing.brokerExchange) === "TOKYO" && listing.currency === "JPY";
  if (!tokyo) return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };

  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const daily = picked.id === "daily";
  const shared = {
    ...answer,
    listing,
    cashCurrency: "JPY",
    basis: daily
      ? `barème ネオトレ, ${picked.label}, lu le ${SCHEDULE.readOn} : 0 jusqu'à 1 000 000 ¥ par jour, 880 ¥ / 1 100 ¥ / 1 540 ¥ jusqu'à 1,5 / 2 / 3 millions, puis 295 ¥ par million, TTC ; l'aller-retour du jour compte l'achat et la vente`
      : `barème ネオトレ, ${picked.label}, lu le ${SCHEDULE.readOn} : 50 ¥ à 660 ¥ par ordre jusqu'à 3 000 000 ¥, 880 ¥ au-delà, TTC`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const yen = daily ? dailyYen(notional * 2) : plus(perOrderYen(notional), perOrderYen(notional));
  const commissionUsd = yen == null ? null : dollars(yen, "JPY");
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    "ligne en yens : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: daily
      ? { perDay: yen, dayAmount: notional * 2, currency: "JPY", plan: picked.id }
      : { perOrder: perOrderYen(notional), currency: "JPY", eachWay: true, plan: picked.id },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
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
          plans: PLANS,
          flat: "50 / 88 / 100 / 198 / 374 / 440 / 660 JPY up to 50k / 100k / 200k / 500k / 1M / 1.5M / 3M, 880 above, tax included, per order",
          daily: "0 up to 1M JPY a day, 880 / 1100 / 1540 up to 1.5M / 2M / 3M, +295 each further 1M, tax included; buy and sell of the trip on one day",
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
    console.error(
      "usage : node brokers/sbineotrade/sbineotrade_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=flat|daily] [--json]"
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
  console.log(`${l.ticker || l.isin} — ${l.name || ""}  [${planOf(out.plan)?.label || out.plan}]`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
