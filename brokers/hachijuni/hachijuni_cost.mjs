// What one round trip costs at Hachijuni Securities (八十二証券, Hachijuni
// Nagano Bank group), online trade (オンライントレード): buy n shares at price p,
// sell them back at once, in dollars. Branch orders, odd lots and margin stay
// out: the online service is cash round lots on the TSE only
// ("現物株の単元株取引に限定しております").
//
// Fee page read 2026-10-26 (手数料について, "【オンライントレードによる取引】"),
// one order, tax included ("委託手数料（税込）"):
//   up to 1 000 000 ¥         "約定代金の 0.63250％", minimum 1 375 ¥
//                             ("1,375円に満たない場合は1,375円")
//   1M to 1.5M                0.49500 % + 1 375 ¥
//   1.5M to 2.5M              0.46750 % + 1 788 ¥
//   2.5M to 3M                0.45650 % + 2 063 ¥
//   3M to 5M                  0.44000 % + 2 558 ¥
//   5M to 10M                 0.35750 % + 6 683 ¥
//   10M to 20M                0.24750 % + 17 683 ¥
//   20M to 30M                0.22000 % + 23 183 ¥
//   30M to 40M                0.16500 % + 39 683 ¥
//   40M to 50M                0.13750 % + 50 683 ¥
//   above 50M                 "一律121,000円"
//   The page only says the yen paid may differ from the formula through
//   rounding ("端数処理の関係により"), with no rule: none is applied.
//   One online trade is limited to 30 000 000 ¥ ("1回の取引の約定金額上限を
//   3,000万円以下"), so the bands above 30M are not reached; a larger order
//   answers N/A.
// Left out: the online account fee, 3 300 ¥ a year, charged only to clients
// who have not taken the electronic-delivery service (free to avoid).
//
// Cash on this ticket is yen (deposits from the 八十二長野銀行 account by
// らくらく振替, settlement in the securities account): every line is a yen
// listing, so there is no conversion. Japan has no stamp; the tax map is read
// by ISIN all the same.
//
//   https://www.82sec.co.jp/trade/fee.php
//   https://www.82sec.co.jp/trade/rule.php
//   https://www.82sec.co.jp/trade/commodity.php
//
//   node brokers/hachijuni/hachijuni_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000
//   node brokers/hachijuni/hachijuni_cost.mjs 1306 Tokyo JPY --shares=10 --price=3000
//   node brokers/hachijuni/hachijuni_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("hachijuni-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.82sec.co.jp/trade/fee.php",
  rules: "https://www.82sec.co.jp/trade/rule.php",
  readOn: "2026-10-26",
  entity: "八十二証券 オンライントレード",
  summary: "online trade, tax included, per order: 0.6325 % up to 1M JPY (min 1375 JPY), then banded rate + fixed yen down to 0.1375 % + 50683 JPY, flat 121000 JPY above 50M; one trade capped at 30M JPY",
};

// [upper bound of the band in yen, rate, fixed yen], tax included.
const BANDS = [
  [1_000_000, 0.0063250, 0],
  [1_500_000, 0.0049500, 1_375],
  [2_500_000, 0.0046750, 1_788],
  [3_000_000, 0.0045650, 2_063],
  [5_000_000, 0.0044000, 2_558],
  [10_000_000, 0.0035750, 6_683],
  [20_000_000, 0.0024750, 17_683],
  [30_000_000, 0.0022000, 23_183],
  [40_000_000, 0.0016500, 39_683],
  [50_000_000, 0.0013750, 50_683],
];
const FLAT_ABOVE = 121_000;
const MIN = 1_375;
const ORDER_CAP = 30_000_000;

const JAPAN = new Set(["TOKYO"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One online order, tax included. Above the order cap: null.
function orderYen(notional) {
  if (!(notional > 0) || notional > ORDER_CAP) return null;
  const band = BANDS.find(([upTo]) => notional <= upTo);
  if (!band) return FLAT_ABOVE;
  return Math.max(MIN, notional * band[1] + band[2]);
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
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "JPY",
    remark: "",
    url: SCHEDULE.url,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue 八十二証券 n'existe pas encore : lancer `node brokers/hachijuni/hachijuni_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue 八十二証券` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez 八十二証券`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "hachijuni",
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
  if (!JAPAN.has(loose(listing.brokerExchange)) || listing.currency !== "JPY") {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    basis: `barème オンライントレード 八十二証券, lu le ${SCHEDULE.readOn} : 0,6325 % TTC jusqu'à 1 000 000 ¥ (minimum 1 375 ¥), puis taux par tranche + fixe (0,495 % + 1 375 ¥ jusqu'à 1,5 M ¥, …, 0,22 % + 23 183 ¥ jusqu'à 30 M ¥) par ordre, sans arrondi imprimé ; ordre en ligne plafonné à 30 000 000 ¥`,
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
  const one = orderYen(notional);
  const commissionUsd = one == null ? null : dollars(one * 2, "JPY");
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
    commission: { perOrder: one, currency: "JPY", eachWay: true, bands: BANDS, min: MIN },
    bp: marketBp,
    perShare: marketPerShare,
    ...(one == null
      ? { why: "ordre au-delà de 30 000 000 ¥ : refusé par la オンライントレード" }
      : bookUsd == null
        ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
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
    console.log(JSON.stringify({ ...SCHEDULE, japan: SCHEDULE.summary }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/hachijuni/hachijuni_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
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
    if (out.commission?.perOrder != null) console.log(`  (${out.commission.perOrder} ¥ par ordre)`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
