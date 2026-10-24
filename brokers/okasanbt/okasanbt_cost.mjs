// What one round trip costs at Okasan Business & Technology Securities
// (岡三ビジネス＆テクノロジー証券): buy n shares at price p, sell them back at
// once, in dollars. Net-trading cash orders. Margin, operator phone orders
// and odd-lot buy-ups stay out.
//
// Read 2026-10-23 on the live page (www.secjp.co.jp answered).
//
// Two commission courses, chosen by the client in the trading screen and
// changeable each day, so there are two plans (`plan`):
//   pertrade  約定毎手数料コース, one fee for each trade. The default.
//   daily     １日定額コース, "１日の約定代金300万円毎に2,200円".
//
//   Tokyo, cash, tax included
//     pertrade  "１取引毎に100万円以下は1,100円 100万円超は1,650円"
//     daily     2 200 ¥ for each started 3 000 000 ¥ of the day's executions;
//               30 trades or more in a day add 22 000 ¥ (not one round trip)
//
// The round trip is bought and sold the same day, so on the daily course the
// day's amount is the buy and the sale together (as matsui_cost.mjs does).
// Prior turnover that day is unknown, so the day is this trip only.
//
// Cash is yen only (deposits.mjs) and every catalogue line is a Tokyo
// listing in yen, so there is no conversion. Japan has no stamp; the tax map
// is read by ISIN all the same.
//
//   https://www.secjp.co.jp/service/commission/net/
//
//   node brokers/okasanbt/okasanbt_cost.mjs 1306 Tokyo JPY --shares=50 --price=3000
//   node brokers/okasanbt/okasanbt_cost.mjs 7203 Tokyo JPY --shares=500 --price=3000 --plan=daily
//   node brokers/okasanbt/okasanbt_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("okasanbt-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.secjp.co.jp/service/commission/net/",
  readOn: "2026-10-23",
  entity: "岡三ビジネス＆テクノロジー証券",
};

export const PLANS = [
  { id: "pertrade", label: "約定毎手数料コース", name: "per-trade course" },
  { id: "daily", label: "１日定額コース", name: "daily flat course" },
];
const DEFAULT_PLAN = "pertrade";

// Tax included: [upper bound in yen, fee in yen].
const PER_ORDER = [[1_000_000, 1_100]];
const PER_ORDER_TOP = 1_650;
// 2 200 ¥ for each started 3 000 000 ¥ of the day.
const DAILY = [];
const DAILY_STEP = 3_000_000;
const DAILY_ADD = 2_200;

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
  const [top, topFee] = DAILY.length ? DAILY[DAILY.length - 1] : [0, 0];
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
    return { ...answer, why: "le catalogue 岡三B&T n'existe pas encore : lancer `node brokers/okasanbt/okasanbt_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue 岡三B&T` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez 岡三B&T`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "okasanbt",
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
      ? `barème 岡三B&T, ${picked.label}, lu le ${SCHEDULE.readOn} : 2 200 ¥ par tranche entamée de 3 000 000 ¥ par jour, TTC ; l'aller-retour du jour compte l'achat et la vente`
      : `barème 岡三B&T, ${picked.label}, lu le ${SCHEDULE.readOn} : 1 100 ¥ par ordre jusqu'à 1 000 000 ¥, 1 650 ¥ au-delà, TTC`,
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
          pertrade: "1100 JPY a trade up to 1M, 1650 above, tax included",
          daily: "2200 JPY for each started 3M JPY of the day, tax included; buy and sell of the trip on one day",
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
      "usage : node brokers/okasanbt/okasanbt_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=pertrade|daily] [--json]"
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
