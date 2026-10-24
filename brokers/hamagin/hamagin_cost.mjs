// What one round trip costs at Hamagin Tokai Tokyo Securities (浜銀TT証券),
// 浜銀TT証券ダイレクト, its online service: buy n shares at price p, sell them
// back at once, in dollars. Branch orders, odd lots and margin stay out.
// Foreign shares are branch-only and not in the catalogue.
//
// Read 2026-10-24 (the fee page says "2026年7月31日").
//
//   Japan, shares, ETF, J-REIT, one order, tax included
//     浜銀TT証券ダイレクト: "基本委託手数料より 40％割引 (最低手数料：1,650円
//     (税込み))"; the page prints both columns
//       約定代金               base (min 2 750 ¥)       Direct (min 1 650 ¥)
//       up to 1 000 000 ¥      1.2650 %                 0.7590 %
//       up to 2 000 000 ¥      0.9350 % + 3 300 ¥       0.5610 % + 1 980 ¥
//       up to 3 000 000 ¥      0.9075 % + 3 850 ¥       0.5445 % + 2 310 ¥
//       up to 4 000 000 ¥      0.8580 % + 5 335 ¥       0.5148 % + 3 201 ¥
//       up to 5 000 000 ¥      0.8470 % + 5 775 ¥       0.5082 % + 3 465 ¥
//       up to 10 000 000 ¥     0.7260 % + 11 825 ¥      0.4356 % + 7 095 ¥
//       up to 30 000 000 ¥     0.5830 % + 26 125 ¥      0.3498 % + 15 675 ¥
//       up to 50 000 000 ¥     0.2750 % + 118 525 ¥     0.1650 % + 71 115 ¥
//       above                  0.0880 % + 212 025 ¥     0.0528 % + 127 215 ¥
//     The Direct minimum is 1 650 ¥ ("1,650円に満たない場合は 1,650円").
//     No cap printed. The fee is worked out on the tax-exclusive amount,
//     yen fractions dropped along the way ("基本手数料（税抜）を基に算出して
//     おり、算出過程において円単位未満は切捨てます"): here the Direct column
//     less tax (÷ 1.1), truncated, then 10 % tax, truncated.
//     The 割引制度 (account, activity and asset discounts) is for branch
//     orders only ("浜銀TT証券ダイレクトのお取引には適用されません").
//
// Cash on this ticket is yen (../../deposits.mjs): every line is a yen
// listing, so there is no conversion. Japan has no stamp; the tax map is
// read by ISIN all the same. Fukuoka and Sapporo have no book leaf
// (../../spreads/venues.mjs): their total is N/A, the commission beside it.
//
//   https://www.hamagintt.co.jp/service/charge.html
//   https://www.hamagintt.co.jp/service/online/
//
//   node brokers/hamagin/hamagin_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000
//   node brokers/hamagin/hamagin_cost.mjs 1553 Nagoya JPY --shares=10 --price=2000
//   node brokers/hamagin/hamagin_cost.mjs 1449 Sapporo JPY --shares=100 --price=700
//   node brokers/hamagin/hamagin_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("hamagin-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.hamagintt.co.jp/service/charge.html",
  online: "https://www.hamagintt.co.jp/service/online/",
  readOn: "2026-10-24",
  tableOn: "2026-07-31",
  entity: "浜銀TT証券ダイレクト",
  summary: "Direct: base commission less 40 % (0.759 % up to 1M, min 1650; 0.561 % + 1980 to 2M; ... 0.0528 % + 127215 above, tax included), worked out before tax with yen fractions dropped, per order",
};

// Direct column as printed, tax included: [upper bound in yen, rate, add in yen].
const DIRECT = [
  [1_000_000, 0.00759, 0],
  [2_000_000, 0.00561, 1_980],
  [3_000_000, 0.005445, 2_310],
  [4_000_000, 0.005148, 3_201],
  [5_000_000, 0.005082, 3_465],
  [10_000_000, 0.004356, 7_095],
  [30_000_000, 0.003498, 15_675],
  [50_000_000, 0.00165, 71_115],
  [Infinity, 0.000528, 127_215],
];
const DIRECT_MIN = 1_650;
const VAT = 1.1;

const JAPAN = new Set(["TOKYO", "NAGOYA", "FUKUOKA", "SAPPORO"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One Direct order: the column less tax, yen dropped, then tax, yen
// dropped; at least 1 650 ¥ tax included.
function orderYen(notional) {
  if (!(notional > 0)) return null;
  const [, rate, add] = DIRECT.find(([upTo]) => notional <= upTo);
  const net = Math.floor((notional * rate + add) / VAT + 1e-9);
  return Math.max(DIRECT_MIN, Math.floor(net * VAT + 1e-9));
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
    return { ...answer, why: "le catalogue 浜銀TT n'existe pas encore : lancer `node brokers/hamagin/hamagin_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue 浜銀TT` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez 浜銀TT`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "hamagin",
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
    basis: `barème 浜銀TT証券ダイレクト (au ${SCHEDULE.tableOn}), lu le ${SCHEDULE.readOn} : barème de base moins 40 % (0,759 % jusqu'à 1 000 000 ¥, puis dégressif), minimum 1 650 ¥ TTC par ordre, calcul hors taxe en yens tronqués`,
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
    commission: { perOrder: one, currency: "JPY", eachWay: true, discount: 0.4, min: DIRECT_MIN },
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
    console.error("usage : node brokers/hamagin/hamagin_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
