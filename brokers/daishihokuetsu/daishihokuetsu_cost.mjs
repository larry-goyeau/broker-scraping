// What one round trip costs at Daishi Hokuetsu Securities (第四北越証券),
// Internet Home Trade (インターネット・ホームトレード): buy n shares at price p,
// sell them back at once, in dollars. Face-to-face orders, odd lots and
// margin stay out. The home trade sells domestic shares only (Tokyo, Fukuoka,
// Sapporo); US shares go through an adviser and are not in the catalogue.
//
// Read 2026-10-24 (the fee page says "2024年8月20日現在").
//
//   Japan, listed shares, ETF, ETN, REIT, one order, tax included
//     home trade ("ホームトレード取引の手数料表")
//       株式委託手数料 （約定代金×0.38％）×1.10円, so 0.418 % tax included
//       yen fractions dropped ("円未満の端数は切り捨て")
//       minimum 2 200 ¥ tax included ("最低2,200円（税込み）")
//       no cap printed
//     A home-trade order is limited to 30 000 000 ¥ ("株式等の売買注文は一回
//     のご注文につき、3,000万円以内"); a larger one answers N/A.
//     Same name, same day, same side counts as one order ("一口注文").
//     The rule for a sale worth less than the 2 200 ¥ minimum (fee = trade
//     value) does not reach a realistic order.
//     The マイレージ（特別）割引 belongs to the face-to-face table only.
//     Online service, information service and custody: free.
//
// Cash on this ticket is yen (../../deposits.mjs): every line is a yen
// listing, so there is no conversion. Japan has no stamp; the tax map is
// read by ISIN all the same. Fukuoka and Sapporo have no book leaf
// (../../spreads/venues.mjs): their total is N/A, the commission beside it.
//
//   https://www.dh-sec.co.jp/fee/
//   https://www.dh-sec.co.jp/home_trade/
//
//   node brokers/daishihokuetsu/daishihokuetsu_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000
//   node brokers/daishihokuetsu/daishihokuetsu_cost.mjs 1306 Tokyo JPY --shares=10 --price=3000
//   node brokers/daishihokuetsu/daishihokuetsu_cost.mjs 1401 Fukuoka JPY --shares=100 --price=500
//   node brokers/daishihokuetsu/daishihokuetsu_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("daishihokuetsu-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.dh-sec.co.jp/fee/",
  homeTrade: "https://www.dh-sec.co.jp/home_trade/",
  readOn: "2026-10-24",
  tableOn: "2024-08-20",
  entity: "第四北越証券 ホームトレード",
  summary: "home trade: (trade value x 0.38 %) x 1.10, yen fractions dropped, minimum 2200 JPY tax included, per order; orders capped at 30M JPY",
};

// (約定代金 × 0.38 %) × 1.10, tax included.
const RATE = 0.0038 * 1.1;
const MIN = 2_200;
const ORDER_CAP = 30_000_000;

const JAPAN = new Set(["TOKYO", "FUKUOKA", "SAPPORO"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One home-trade order, tax included. Above the order cap: null.
function orderYen(notional) {
  if (!(notional > 0) || notional > ORDER_CAP) return null;
  return Math.max(MIN, Math.floor(notional * RATE + 1e-9));
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
    return { ...answer, why: "le catalogue 第四北越 n'existe pas encore : lancer `node brokers/daishihokuetsu/daishihokuetsu_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue 第四北越` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez 第四北越`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "daishihokuetsu",
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
    basis: `barème ホームトレード 第四北越証券 (au ${SCHEDULE.tableOn}), lu le ${SCHEDULE.readOn} : (montant × 0,38 %) × 1,10, soit 0,418 % TTC, minimum 2 200 ¥ TTC par ordre, yens tronqués ; ordre en ligne plafonné à 30 000 000 ¥`,
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
    commission: { perOrder: one, currency: "JPY", eachWay: true, rate: RATE, min: MIN },
    bp: marketBp,
    perShare: marketPerShare,
    ...(one == null
      ? { why: "ordre au-delà de 30 000 000 ¥ : refusé par la ホームトレード" }
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
    console.error("usage : node brokers/daishihokuetsu/daishihokuetsu_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
