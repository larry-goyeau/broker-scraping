// What one round trip costs at FFG Securities (FFG証券, Fukuoka Financial
// Group): buy n shares at price p, sell them back at once, in dollars.
// Internet orders on the net-only account (ネット専用), the account that only
// trades online. The face-to-face table and the マルチ（対面＆ネット）account
// are adviser accounts and stay out. Margin and odd lots stay out (odd lots
// are not taken online).
//
// Read 2026-10-23.
//
//   Tokyo, cash, one order, tax included: the face-to-face table, 90 % off
//   ("ネット専用 … 90%OFF"), minimum 275 ¥ ("ネット専用からのご注文…275円
//   （税抜250円）＝対面の90％OFF")
//     face-to-face table                     net-only (one tenth)
//       up to 1 000 000 ¥     1.265 %                0.1265 %
//       up to 3 000 000 ¥     0.880 % + 3 850 ¥      0.088 % + 385 ¥
//       up to 5 000 000 ¥     0.770 % + 7 150 ¥      0.077 % + 715 ¥
//       up to 10 000 000 ¥    0.715 % + 9 900 ¥      0.0715 % + 990 ¥
//       up to 30 000 000 ¥    0.495 % + 31 900 ¥     0.0495 % + 3 190 ¥
//       up to 50 000 000 ¥    0.330 % + 81 400 ¥     0.033 % + 8 140 ¥
//       above                 0.110 % + 191 400 ¥    0.011 % + 19 140 ¥
//     fractions of a yen are dropped ("1円未満の端数は切り捨てます")
//   So the 275 ¥ minimum holds up to about 217 000 ¥ an order.
//
// Cash is yen only (deposits.mjs) and every catalogue line is a Tokyo
// listing in yen (online trading is TSE only), so there is no conversion.
// Japan has no stamp; the tax map is read by ISIN all the same. Custody is
// free ("国内口座管理料 無料").
//
//   https://www.ffg-sec.co.jp/service/commission/
//   https://www.ffg-sec.co.jp/service/internet_trade/
//
//   node brokers/ffg/ffg_cost.mjs 1306 Tokyo JPY --shares=50 --price=3000
//   node brokers/ffg/ffg_cost.mjs 7203 Tokyo JPY --shares=1000 --price=3000
//   node brokers/ffg/ffg_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("ffg-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.ffg-sec.co.jp/service/commission/",
  internet: "https://www.ffg-sec.co.jp/service/internet_trade/",
  readOn: "2026-10-23",
  entity: "FFG証券",
  account: "ネット専用",
};

// Face-to-face table, tax included: [upper bound in yen, rate, add in yen].
const TABLE = [
  [1_000_000, 0.01265, 0],
  [3_000_000, 0.0088, 3_850],
  [5_000_000, 0.0077, 7_150],
  [10_000_000, 0.00715, 9_900],
  [30_000_000, 0.00495, 31_900],
  [50_000_000, 0.0033, 81_400],
  [Infinity, 0.0011, 191_400],
];
// Net-only account: 90 % off, minimum 275 yen tax included.
const NET_SHARE = 0.1;
const NET_MIN = 275;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One online order on the net-only account, tax included.
function orderYen(notional) {
  if (!(notional > 0)) return null;
  const [, rate, add] = TABLE.find(([upTo]) => notional <= upTo);
  return Math.max(NET_MIN, Math.floor((notional * rate + add) * NET_SHARE + 1e-9));
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
    return { ...answer, why: "le catalogue FFG n'existe pas encore : lancer `node brokers/ffg/ffg_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue FFG` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez FFG`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "ffg",
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
    basis: `barème FFG, compte ネット専用, lu le ${SCHEDULE.readOn} : barème guichet moins 90 % (1,265 % jusqu'à 1 000 000 ¥, soit 0,1265 %), minimum 275 ¥ TTC par ordre`,
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
          account: "net-only (ネット専用); the マルチ account and face-to-face orders stay out",
          japan: "face-to-face table (1.265 % up to 1M; 0.88 % + 3850 to 3M; 0.77 % + 7150 to 5M; 0.715 % + 9900 to 10M; 0.495 % + 31900 to 30M; 0.33 % + 81400 to 50M; 0.11 % + 191400 above, tax included) x 0.1, min 275 JPY, per order, yen fractions dropped",
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
      "usage : node brokers/ffg/ffg_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]"
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
