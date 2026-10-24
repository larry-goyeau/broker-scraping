// What one round trip costs at Marusan Securities (丸三証券), MARUSAN-NET
// internet orders: buy n shares at price p, sell them back at once, in
// dollars. Orders through a sales representative, odd lots and margin stay
// out. Foreign shares cannot be traded on MARUSAN-NET and are not in the
// catalogue.
//
// Read 2026-10-23.
//
//   Japan, listed shares, ETF, REIT, one order, tax included
//     MARUSAN-NET pays 75 % of the basic table, less the special discount,
//     yen fractions dropped ("上記(1)の基本手数料から上記(2)の特別割引額を
//     差引いた金額の75％となっております。(1円未満切捨て)")
//     basic table (same day, same name, same side added together)
//       up to 700 000 ¥              1.265 %, at least 2 750 ¥
//       up to 1 000 000 ¥            1.067 %  + 1 386 ¥
//       up to 3 000 000 ¥            0.869 %  + 3 366 ¥
//       up to 5 000 000 ¥            0.8415 % + 4 191 ¥
//       up to 10 000 000 ¥           0.693 %  + 11 616 ¥
//       up to 30 000 000 ¥           0.5665 % + 24 266 ¥
//       up to 50 000 000 ¥           0.2585 % + 116 666 ¥
//       up to 100 000 000 ¥          0.044 %  + 223 916 ¥
//       above                        0.0066 % + 261 316 ¥
//     so the online floor is 2 062 ¥ (75 % of 2 750).
//     The special discount (特別割引) for individuals is set every six
//     months from past commissions and assets held, up to 15 % ("最大15％
//     割引"). A new client has none; the remark gives the most it saves.
//     The 99 % rule on a sale worth less than the fee does not reach a
//     realistic order.
//
//   https://www.marusan-sec.co.jp/torihiki/fee/fee_01/
//
//   node brokers/marusan/marusan_cost.mjs 7203 Tokyo JPY --shares=52 --price=2975
//   node brokers/marusan/marusan_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("marusan-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.marusan-sec.co.jp/torihiki/fee/fee_01/",
  readOn: "2026-10-23",
  entity: "丸三証券 MARUSAN-NET",
  summary: "MARUSAN-NET: 75 % of the basic table (1.265 % min 2750 JPY up to 700k, then tiered), yen fractions dropped, tax included, per order; special discount up to 15 % in the remark",
};

// Basic table, tax included: [upper bound in yen, rate, add].
const BASIC = [
  [700_000, 0.01265, 0],
  [1_000_000, 0.01067, 1_386],
  [3_000_000, 0.00869, 3_366],
  [5_000_000, 0.008415, 4_191],
  [10_000_000, 0.00693, 11_616],
  [30_000_000, 0.005665, 24_266],
  [50_000_000, 0.002585, 116_666],
  [100_000_000, 0.00044, 223_916],
  [Infinity, 0.000066, 261_316],
];
const BASIC_MIN = 2_750;
const NET_FACTOR = 0.75;
const SPECIAL_MAX = 0.15;

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

function basicYen(notional) {
  if (!(notional > 0)) return null;
  for (const [upTo, rate, add] of BASIC) if (notional <= upTo) return Math.max(BASIC_MIN, notional * rate + add);
  return null;
}

// One MARUSAN-NET order; `special` is the 特別割引 rate (0 for a new client).
function legYen(notional, special = 0) {
  const basic = basicYen(notional);
  return basic == null ? null : Math.floor(basic * (1 - special) * NET_FACTOR);
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
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Marusan n'existe pas encore : lancer `node brokers/marusan/marusan_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Marusan` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Marusan`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "marusan",
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
    url: SCHEDULE.url,
    basis: `barème MARUSAN-NET, lu le ${SCHEDULE.readOn} : 75 % du barème de base (1,265 % jusqu'à 700 000 ¥, minimum 2 750 ¥, puis dégressif), sans 特別割引, TTC`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, remark: "", why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
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
  const one = legYen(notional);
  const commissionUsd = one == null ? null : dollars(one * 2, "JPY");
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    `特別割引 jusqu'à ${SPECIAL_MAX * 100} % selon les commissions passées et les avoirs : remarque`,
    "ligne en yens : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  const remark = (() => {
    const low = legYen(notional, SPECIAL_MAX);
    const gap = one == null || low == null ? 0 : ((one - low) * 2) / notional;
    return gap > 0 ? `Fees might be ${Number((gap * 100).toFixed(2))}% lower.` : "";
  })();

  return {
    ...shared,
    remark,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { perOrder: one, currency: "JPY", eachWay: true },
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
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          japan: SCHEDULE.summary,
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
    console.error("usage : node brokers/marusan/marusan_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
