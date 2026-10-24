// What one round trip costs at Hokuyo Securities (北洋証券, North Pacific
// Bank group), 北洋証券オンラインサービス: buy n shares at price p, sell them
// back at once, in dollars. Branch and adviser orders, odd lots and margin
// stay out. The online service takes Tokyo cash orders only; US shares go
// through the branch and are not in the catalogue.
//
// Read 2026-10-24.
//
//   Japan, listed shares, ETF, REIT, ETN, one order, tax included
//     online = half the base commission ("【オンラインサービスに係る手数料】
//     上場有価証券売買委託手数料 基本料金の50％"; the online page: "店舗での
//     お取引に比べ50％OFF"); ETF, REIT and ETN pay the share table.
//     base table (手数料(税込) 【国内株式等】)          online (half)
//       up to 1 000 000 ¥     1.2540 %                0.6270 %
//       up to 5 000 000 ¥     0.9845 % + 2 695 ¥      0.49225 % + 1 347.5 ¥
//       up to 10 000 000 ¥    0.7150 % + 16 170 ¥     0.3575 % + 8 085 ¥
//       up to 30 000 000 ¥    0.5775 % + 29 920 ¥     0.28875 % + 14 960 ¥
//       up to 50 000 000 ¥    0.3300 % + 104 170 ¥    0.165 % + 52 085 ¥
//       above                 0.2200 % + 159 170 ¥    0.11 % + 79 585 ¥
//     base minimum 2 750 ¥ ("約定代金の1.2540％に相当する額が2,750円に満たない
//     場合 2,750円"), halved with the rest: 1 375 ¥ online.
//     No cap printed. Yen fractions dropped (the page: "端数処理の関係により、
//     上記手数料率に基づく計算結果より少なくなる場合があります").
//     Same name, same day, same side counts as one order.
//     Custody and the foreign-securities account: free.
//
// The account can hold foreign currencies (../../deposits.mjs) and every
// line is a Tokyo listing in yen, so cash held in another currency is
// converted at the firm's rate. The 外貨決済サービス page prints that rate's
// spread in yen per unit, "購入の場合は「プラス」、売却の場合は「マイナス」",
// by the amount in that currency: US dollar ±0.50 円 under 100 000, ±0.25 円
// under 1 million; euro ±0.75 / ±0.37 円; Australian dollar ±0.80 / ±0.40 円;
// above 1 million "別途ご相談", and the other six currencies "営業部店へお問い合わせ".
// The spread over the yen price of one unit (fx.mjs) is the remark "FX x% to
// y% when cash ≠ JPY.", over the three printed currencies at the order's
// size. Japan has no stamp; the tax map is read by ISIN all the same.
//
//   https://www.hokuyo-sec.co.jp/product/commission/
//   https://www.hokuyo-sec.co.jp/online/service/
//   https://www.hokuyo-sec.co.jp/product/settlement/
//
//   node brokers/hokuyo/hokuyo_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000
//   node brokers/hokuyo/hokuyo_cost.mjs 1306 Tokyo JPY --shares=10 --price=3000
//   node brokers/hokuyo/hokuyo_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("hokuyo-parsed.json", import.meta.url);

// 適用為替スプレッド, yen per unit of the currency, by the amount in that
// currency: [upper bound, spread]. Above the last bound the firm quotes on
// request.
const FX_SPREAD = {
  USD: [[100_000, 0.5], [1_000_000, 0.25]],
  EUR: [[100_000, 0.75], [1_000_000, 0.37]],
  AUD: [[100_000, 0.8], [1_000_000, 0.4]],
};

/** "FX x% to y% when cash ≠ JPY." at the order's size, for the printed currencies. */
function fxNote(notionalYen) {
  const yenPer = (ccy) => usdPer(ccy) / usdPer("JPY");
  const gaps = [];
  for (const [ccy, tiers] of Object.entries(FX_SPREAD)) {
    const rate = yenPer(ccy);
    if (!(rate > 0)) continue;
    const tier = tiers.find(([bound]) => notionalYen / rate < bound);
    if (tier) gaps.push((tier[1] / rate) * 100);
  }
  if (!gaps.length) return "";
  const lo = Number(Math.min(...gaps).toFixed(2));
  const hi = Number(Math.max(...gaps).toFixed(2));
  return `FX ${lo === hi ? lo : `${lo}% to ${hi}`}% when cash ≠ JPY.`;
}

const SCHEDULE = {
  url: "https://www.hokuyo-sec.co.jp/product/commission/",
  online: "https://www.hokuyo-sec.co.jp/online/service/",
  readOn: "2026-10-24",
  entity: "北洋証券オンラインサービス",
  summary: "online: 50 % of the base table (1.254 % up to 1M, min 2750; 0.9845 % + 2695 to 5M; 0.715 % + 16170 to 10M; 0.5775 % + 29920 to 30M; 0.33 % + 104170 to 50M; 0.22 % + 159170 above, tax included), yen fractions dropped, per order",
};

// Base table, tax included: [upper bound in yen, rate, add in yen].
const TABLE = [
  [1_000_000, 0.01254, 0],
  [5_000_000, 0.009845, 2_695],
  [10_000_000, 0.00715, 16_170],
  [30_000_000, 0.005775, 29_920],
  [50_000_000, 0.0033, 104_170],
  [Infinity, 0.0022, 159_170],
];
const TABLE_MIN = 2_750;
// Online: 50 % of the base commission.
const ONLINE_SHARE = 0.5;

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

// One online order, tax included.
function orderYen(notional) {
  if (!(notional > 0)) return null;
  const [, rate, add] = TABLE.find(([upTo]) => notional <= upTo);
  return Math.floor(Math.max(TABLE_MIN, notional * rate + add) * ONLINE_SHARE + 1e-9);
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
    return { ...answer, why: "le catalogue 北洋 n'existe pas encore : lancer `node brokers/hokuyo/hokuyo_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue 北洋` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez 北洋`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "hokuyo",
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
    basis: `barème 北洋証券, lu le ${SCHEDULE.readOn} : en ligne 50 % du barème de base (1,254 % jusqu'à 1 000 000 ¥, soit 0,627 %, puis dégressif), minimum 2 750 ¥ divisé par deux (1 375 ¥) TTC par ordre, yens tronqués`,
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
    "ligne en yens : pas de change si le compte est en yens ; écart de change publié (USD ±0,50 ¥, EUR ±0,75 ¥, AUD ±0,80 ¥ sous 100 000 unités) en remarque",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    remark: fxNote(notional),
    commission: { perOrder: one, currency: "JPY", eachWay: true, online: ONLINE_SHARE, min: TABLE_MIN * ONLINE_SHARE },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
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
    console.error("usage : node brokers/hokuyo/hokuyo_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
