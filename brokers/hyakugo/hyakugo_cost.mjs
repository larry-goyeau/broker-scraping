// What one round trip costs at Hyakugo Securities (百五証券), online trade
// (百五証券オンライントレード): buy n shares at price p, sell them back at
// once, in dollars. Face-to-face and phone orders, odd lots and the 国内
// 店頭取引 (the firm's own US quote, about 2.5 % inside the price) stay out.
//
// Read 2026-10-23 (the fee page says "2022年8月22日時点").
//
//   Japan, cash, one order, tax included, shares, ETF, REIT
//     online = 25 % off the face-to-face table
//     ("対面・電話によるご注文における手数料の25％割引"),
//     floor 2 062 ¥, cap 206 250 ¥ (face-to-face: floor 2 750, cap 275 000)
//     face-to-face table
//       up to 1 000 000 ¥             1.155 %
//       up to 3 000 000 ¥             0.88 %  + 2 750 ¥
//       up to 4 000 000 ¥             0.825 % + 4 400 ¥
//       up to 5 000 000 ¥             0.77 %  + 6 600 ¥
//       up to 10 000 000 ¥            0.693 % + 10 450 ¥
//       up to 30 000 000 ¥            0.495 % + 30 250 ¥
//       up to 50 000 000 ¥            0.22 %  + 112 750 ¥
//       above                         0.022 % + 211 750 ¥
//     fractions of a yen dropped
//
//   United States (外国委託取引, agency orders, the only kind online)
//     国内取次手数料, tax included, on the yen amount
//       up to 1 000 000 ¥             1.10 %
//       up to 3 000 000 ¥             0.99 % + 1 100 ¥
//       up to 5 000 000 ¥             0.88 % + 4 400 ¥
//       up to 10 000 000 ¥            0.77 % + 9 900 ¥
//       up to 30 000 000 ¥            0.66 % + 20 900 ¥
//       up to 50 000 000 ¥            0.55 % + 53 900 ¥
//       up to 100 000 000 ¥           0.44 % + 108 900 ¥
//       above                         0.33 % + 218 900 ¥
//     plus the 現地委託手数料 (the US broker's commission), which the page
//     does not state: "その時々の市場状況、現地情勢等に応じて決定されます
//     ので、その金額等をあらかじめ記載することはできません". The foreign-
//     stock page, the services page, the risk page and the online manual
//     carry no figure either, and the US broker is not named. A US line
//     answers N/A, with the published parts beside it.
//
// Conversion: USD 0.50 ¥ each way below 100 000 dollars (為替スプレッド).
// The account holds dollars (../../deposits.mjs), so a US line gets that as
// a remark.
//
//   https://www.105sec.co.jp/service/commission/
//   https://www.105sec.co.jp/service/services/
//   https://www.105sec.co.jp/product/fstock/
//
//   node brokers/hyakugo/hyakugo_cost.mjs 7203 Tokyo JPY --shares=52 --price=2975
//   node brokers/hyakugo/hyakugo_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/hyakugo/hyakugo_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("hyakugo-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.105sec.co.jp/service/commission/",
  services: "https://www.105sec.co.jp/service/services/",
  foreign: "https://www.105sec.co.jp/product/fstock/",
  readOn: "2026-10-23",
  tableOn: "2022-08-22",
  entity: "百五証券",
};

// Face-to-face table, tax included: [upper bound in yen, rate, add].
const JP_TABLE = [
  [1_000_000, 0.01155, 0],
  [3_000_000, 0.0088, 2_750],
  [4_000_000, 0.00825, 4_400],
  [5_000_000, 0.0077, 6_600],
  [10_000_000, 0.00693, 10_450],
  [30_000_000, 0.00495, 30_250],
  [50_000_000, 0.0022, 112_750],
  [Infinity, 0.00022, 211_750],
];
const ONLINE_FACTOR = 0.75;
const ONLINE_MIN = 2_062;
const ONLINE_CAP = 206_250;

// 国内取次手数料, tax included: [upper bound in yen, rate, add].
const US_TABLE = [
  [1_000_000, 0.011, 0],
  [3_000_000, 0.0099, 1_100],
  [5_000_000, 0.0088, 4_400],
  [10_000_000, 0.0077, 9_900],
  [30_000_000, 0.0066, 20_900],
  [50_000_000, 0.0055, 53_900],
  [100_000_000, 0.0044, 108_900],
  [Infinity, 0.0033, 218_900],
];
// Yen per dollar inside the rate, each way, under 100 000 dollars.
const FX_YEN = 0.5;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
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

const yenOf = (amount, currency) => {
  const usd = toUsd(amount, currency);
  const jpy = usdPer("JPY");
  return usd == null || !(jpy > 0) ? null : usd / jpy;
};

function tableYen(amount, table) {
  if (!(amount > 0)) return null;
  for (const [upTo, rate, add] of table) if (amount <= upTo) return amount * rate + add;
  return null;
}

// One online order: 25 % off the face-to-face fee, then the online floor and cap.
function japanYen(notional) {
  const face = tableYen(notional, JP_TABLE);
  if (face == null) return null;
  return Math.floor(Math.min(ONLINE_CAP, Math.max(ONLINE_MIN, face * ONLINE_FACTOR)));
}

function fxRemarkUsd() {
  const jpy = usdPer("JPY");
  if (!(jpy > 0)) return fxRemark("", "USD");
  return fxRemark((FX_YEN * jpy * 100).toFixed(3), "USD");
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
    return { ...answer, why: "le catalogue Hyakugo n'existe pas encore : lancer `node brokers/hyakugo/hyakugo_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Hyakugo` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Hyakugo`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "hyakugo",
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
  const market = loose(listing.brokerExchange);
  const japan = JAPAN.has(market) && listing.currency === "JPY";
  const american = US_MICS.has(code(m.row.mic || market)) && listing.currency === "USD";
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: japan ? "JPY" : "USD",
    remark: american ? fxRemarkUsd() : "",
    url: SCHEDULE.url,
    basis: japan
      ? `barème 百五証券 (au ${SCHEDULE.tableOn}), lu le ${SCHEDULE.readOn} : ordre en ligne = barème guichet − 25 %, plancher 2 062 ¥, plafond 206 250 ¥, TTC`
      : `barème 百五証券 (au ${SCHEDULE.tableOn}), lu le ${SCHEDULE.readOn} : 国内取次手数料 1,10 % TTC jusqu'à 1 000 000 ¥, puis dégressif, plus un 現地委託手数料 non publié`,
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
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && marketBp == null) {
    // No US dealer is named: the quoted NBBO.
    const quoted = usBookPerShare({ broker: "hyakugo", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const bookNote =
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part (aucun courtier américain nommé)`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`;
  const trade = {
    shares: n,
    price: p,
    notional,
    notionalUsd: finite(notionalUsd, 6),
    currency: listing.currency,
  };
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;

  if (american) {
    const yen = yenOf(notional, "USD");
    const one = yen == null ? null : tableYen(yen, US_TABLE);
    const domesticUsd = one == null ? null : dollars(one * 2, "JPY");
    return {
      ...shared,
      why:
        "le 現地委託手数料 (commission du courtier américain) n'est pas publié : la page des frais écrit qu'il dépend du marché " +
        `et ne peut être indiqué à l'avance (pages frais, actions étrangères, services, manuel en ligne, lus le ${SCHEDULE.readOn})`,
      commission: {
        domestic: US_TABLE.map(([upTo, rate, add]) => ({ upTo, rate, add })),
        perOrder: one,
        local: null,
        currency: "JPY",
        eachWay: true,
      },
      bp: marketBp,
      perShare: marketPerShare,
      trade,
      published: {
        marché: finite(bookUsd, 6),
        国内取次手数料: finite(domesticUsd, 6),
        現地委託手数料: null,
        taxes: finite(taxUsd, 6),
      },
      confidence: [
        shared.basis,
        "commission locale non publiée et courtier américain non nommé : pas de total",
        "compte en dollars : change hors du chiffre",
        bookNote,
      ].join(" ; "),
    };
  }

  const one = japanYen(notional);
  const commissionUsd = one == null ? null : dollars(one * 2, "JPY");
  const brokerFees = commissionUsd;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { perOrder: one, currency: "JPY", eachWay: true, online: ONLINE_FACTOR, min: ONLINE_MIN, cap: ONLINE_CAP },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [shared.basis, "ligne en yens : pas de change", bookNote].join(" ; "),
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
          japan: "online: face-to-face table less 25 %, floor 2062 JPY, cap 206250 JPY, tax included, per order",
          us: "国内取次手数料 1.10 % up to 1M JPY then tiered, plus an unpublished 現地委託手数料: N/A",
          conversion: "remark only: 0.50 JPY per USD each way; the account holds USD",
          rule606: "none named: quoted NBBO",
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
    console.error("usage : node brokers/hyakugo/hyakugo_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    const parts = out.parts || out.published || {};
    for (const [k, v] of Object.entries(parts)) console.log(`  ${k.padEnd(15)}: ${show(v)}${v == null ? "" : " $"}`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
