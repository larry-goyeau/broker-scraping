// What one round trip costs at Shikoku Alliance Securities (四国アライアンス
// 証券, Iyo Bank group): buy n shares at price p, sell them back at once, in
// dollars. Online-trade (オンライントレード) cash orders. Counter orders and
// odd lots stay out.
//
// Read 2026-10-23.
//
//   Tokyo, cash, one order, tax included: the commission table, 50 % off
//   online ("国内株式の売買委託手数料：（店頭でのお取引に比べ、）50％OFF")
//     table                                    online (half)
//       minimum               2 750 ¥             1 375 ¥
//       up to 1 000 000 ¥     1.21 %              0.605 %
//       up to 3 000 000 ¥     0.88 % + 3 300 ¥    0.44 % + 1 650 ¥
//       up to 5 000 000 ¥     0.77 % + 6 600 ¥    0.385 % + 3 300 ¥
//       up to 10 000 000 ¥    0.66 % + 12 100 ¥   0.33 % + 6 050 ¥
//       up to 30 000 000 ¥    0.55 % + 23 100 ¥   0.275 % + 11 550 ¥
//     An online order is capped at 30 000 000 ¥ ("1回の売買注文の上限金額
//     は、3,000万円以内"); a larger one goes to the counter at the full table,
//     so it answers N/A here.
//   The page halves "the commission"; the minimum is taken as halved with it
//   (the fee charged is half of what the counter would charge). Fractions of
//   a yen are dropped.
//
// Cash on this ticket is yen: every catalogue line is a Tokyo listing in
// yen, so there is no conversion. Japan has no stamp; the tax map is read by
// ISIN all the same.
//
//   https://www.shikoku-alliance-sec.co.jp/service/commission_charges.html
//   https://www.shikoku-alliance-sec.co.jp/onlinetrade/
//   https://www.shikoku-alliance-sec.co.jp/faq/onlinetrade.html
//
//   node brokers/shikokualliance/shikokualliance_cost.mjs 1306 Tokyo JPY --shares=50 --price=3000
//   node brokers/shikokualliance/shikokualliance_cost.mjs 7203 Tokyo JPY --shares=1000 --price=3000
//   node brokers/shikokualliance/shikokualliance_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("shikokualliance-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.shikoku-alliance-sec.co.jp/service/commission_charges.html",
  online: "https://www.shikoku-alliance-sec.co.jp/onlinetrade/",
  faq: "https://www.shikoku-alliance-sec.co.jp/faq/onlinetrade.html",
  readOn: "2026-10-23",
  entity: "四国アライアンス証券",
};

// Commission table, tax included: [upper bound in yen, rate, add in yen].
// Rows above the online order cap are not written.
const TABLE = [
  [1_000_000, 0.0121, 0],
  [3_000_000, 0.0088, 3_300],
  [5_000_000, 0.0077, 6_600],
  [10_000_000, 0.0066, 12_100],
  [30_000_000, 0.0055, 23_100],
];
const TABLE_MIN = 2_750;
// Online: 50 % off.
const ONLINE_SHARE = 0.5;
const ONLINE_CAP = 30_000_000;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One online order, tax included. Above the online cap: null.
function orderYen(notional) {
  if (!(notional > 0) || notional > ONLINE_CAP) return null;
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
    cashCurrency: "",
    remark: "",
    url: SCHEDULE.url,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue 四国アライアンス n'existe pas encore : lancer `node brokers/shikokualliance/shikokualliance_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue 四国アライアンス` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez 四国アライアンス`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "shikokualliance",
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
  const shared = {
    ...answer,
    listing,
    cashCurrency: "JPY",
    basis: `barème 四国アライアンス, lu le ${SCHEDULE.readOn} : barème moins 50 % en ligne (1,21 % jusqu'à 1 000 000 ¥, soit 0,605 %), minimum 2 750 ¥ divisé par deux (1 375 ¥) TTC par ordre ; ordre en ligne plafonné à 30 000 000 ¥`,
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
  const yen = one == null ? null : one * 2;
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
    commission: { perOrder: one, currency: "JPY", eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
    ...(one == null
      ? { why: "ordre au-delà de 30 000 000 ¥ : refusé en ligne, il passe au guichet au barème plein" }
      : bookUsd == null
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
          japan: "commission table (min 2750; 1.21 % up to 1M; 0.88 % + 3300 to 3M; 0.77 % + 6600 to 5M; 0.66 % + 12100 to 10M; 0.55 % + 23100 to 30M, tax included) x 0.5 online, per order, yen fractions dropped; online orders capped at 30M JPY",
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
      "usage : node brokers/shikokualliance/shikokualliance_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]"
    );
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
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
