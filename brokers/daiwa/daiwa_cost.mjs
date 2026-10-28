// What one round trip costs at Daiwa Securities (大和証券): buy n shares at
// price p, sell them back at once, in dollars. Online trade (ダイワのオンライ
// ントレード), cash orders. Branch, contact-centre, margin, るいとう and NISA
// stay out.
//
// Fee page read 2026-10-26 (https://www.daiwa.jp/service/fee/). The client
// picks one of two courses ("2つのお取引コース"), and in the Direct course
// may switch the domestic commission to a daily flat fee, so there are three
// plans (`plan`):
//   consulting  「ダイワ・コンサルティング」コース, internet column
//   direct      「ダイワ・ダイレクト」コース, internet 約定ごと手数料. The default.
//   daily       「ダイワ・ダイレクト」コース with ハッスルレート (1日定額手数料)
//
//   Japan (Tokyo, Nagoya), one order, tax included, truncated to the yen
//   (the page's 500,000-yen example is 1,897 yen for 1,897.5)
//     consulting  0.94820 % up to 1M ¥, 0.72600 % + 2 222 to 5M,
//                 0.53570 % + 11 737 to 10M, 0.43230 % + 22 077 to 30M,
//                 0.24750 % + 77 517 to 50M, 201 267 to 100M,
//                 230 967 to 500M, 263 967 to 1 000M, then + 33 000 for
//                 each 500M; minimum 2 090 ¥
//     direct      0.37950 % up to 1M ¥, 0.29040 % + 891 to 5M,
//                 0.21450 % + 4 686 to 10M, 0.17270 % + 8 866 to 30M,
//                 0.09900 % + 30 976 to 50M, 80 476 to 100M,
//                 110 176 to 500M, 143 176 to 1 000M, then + 33 000 for
//                 each 500M; minimum 1 100 ¥
//     daily       3 300 ¥ for each started 3 000 000 ¥ of the day's
//                 executions. The trip is bought and sold the same day, so
//                 the day is the buy and the sale together (as
//                 okasanbt_cost.mjs does); prior turnover is unknown.
//   United States, one order, both courses (ハッスルレート does not cover US
//   or Chinese shares, so the daily plan pays the Direct line)
//     国内取次手数料, tax included, on the yen value of the trade
//                 0.89100 % up to 1M ¥, 0.79200 % + 990 to 3M,
//                 0.64350 % + 5 445 to 5M, 0.59400 % + 7 920 to 10M,
//                 0.49500 % + 17 820 to 30M, 0.39600 % + 47 520 to 50M,
//                 0.34650 % + 72 270 to 100M, 0.29700 % + 121 770 above
//     現地委託手数料 0.25 % (internet)
//     SEC FEE     20.60 USD per million on the sale (from 2026-04-02)
//   Hong Kong, one order
//     国内取次手数料, tax included, on the yen value of the trade
//       consulting  0.74250 % up to 1M ¥, 0.66000 % + 825 to 3M,
//                   0.53570 % + 4 554 to 5M, 0.49500 % + 6 589 to 10M,
//                   0.41250 % + 14 839 to 30M, 0.33000 % + 39 589 to 50M,
//                   0.28820 % + 60 489 to 100M, 0.24750 % + 101 189 above
//       direct      0.29700 % up to 1M ¥, 0.26400 % + 330 to 3M,
//                   0.21450 % + 1 815 to 5M, 0.19800 % + 2 640 to 10M,
//                   0.16500 % + 5 940 to 30M, 0.13200 % + 15 840 to 50M,
//                   0.11550 % + 24 090 to 100M, 0.09900 % + 40 590 above
//     現地委託手数料 consulting 0.375 %, direct 0.150 %, minimum 50 HKD,
//                 truncated to the cent
//     諸経費       stamp 0.1 % rounded up to the dollar (none on an ETF
//                 since 2015-02-13), 取引所税 0.0027 % and 取引所手数料
//                 0.00565 %, each to the nearest cent. The page lists no
//                 other charge (no AFRC levy, no CCASS fee): none is added.
//   No rounding is printed for the foreign lines: none is applied.
//
// Cash: yen, and fifteen currencies at Citibank Tokyo (deposits.mjs), USD
// and HKD among them. So no conversion is in the number; the remark is the
// published spread over the mid, each way, from the 為替スプレッド一覧 (as of
// 2023-12, linked from the fee page): USD 50 sen, HKD 12 sen.
// Foreign custody (口座管理料) stays out.
//
// US orders: Daiwa names no US broker-dealer, so the book is the quoted
// NBBO of the ticker (no Rule 606 mix).
//
//   https://www.daiwa.jp/service/fee/
//   https://www.daiwa.jp/content/dam/daiwasecurities/products/bond/fr/spread/list.pdf
//   https://www.daiwa.jp/products/equity/foreign/usa/
//   https://www.daiwa.jp/products/equity/foreign/hng/
//
//   node brokers/daiwa/daiwa_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000
//   node brokers/daiwa/daiwa_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000 --plan=consulting
//   node brokers/daiwa/daiwa_cost.mjs 7203 Tokyo JPY --shares=1000 --price=3000 --plan=daily
//   node brokers/daiwa/daiwa_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/daiwa/daiwa_cost.mjs 700 HKEX HKD --shares=100 --price=400
//   node brokers/daiwa/daiwa_cost.mjs --schedule
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

const CATALOGUE = new URL("daiwa-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.daiwa.jp/service/fee/",
  fx: "https://www.daiwa.jp/content/dam/daiwasecurities/products/bond/fr/spread/list.pdf",
  readOn: "2026-10-26",
  fxOn: "2023-12",
  secOn: "2026-04-02",
  entity: "大和証券",
};

export const PLANS = [
  { id: "consulting", label: "ダイワ・コンサルティング", name: "Consulting course" },
  { id: "direct", label: "ダイワ・ダイレクト（約定ごと）", name: "Direct course" },
  { id: "daily", label: "ダイワ・ダイレクト（ハッスルレート）", name: "Direct course, daily flat" },
];
const DEFAULT_PLAN = "direct";

// [upper bound in yen, rate, yen added]; a null rate is a flat fee.
const JP = {
  consulting: {
    min: 2090,
    steps: [
      [1_000_000, 0.0094820, 0],
      [5_000_000, 0.0072600, 2222],
      [10_000_000, 0.0053570, 11737],
      [30_000_000, 0.0043230, 22077],
      [50_000_000, 0.0024750, 77517],
      [100_000_000, null, 201267],
      [500_000_000, null, 230967],
      [1_000_000_000, null, 263967],
    ],
  },
  direct: {
    min: 1100,
    steps: [
      [1_000_000, 0.0037950, 0],
      [5_000_000, 0.0029040, 891],
      [10_000_000, 0.0021450, 4686],
      [30_000_000, 0.0017270, 8866],
      [50_000_000, 0.0009900, 30976],
      [100_000_000, null, 80476],
      [500_000_000, null, 110176],
      [1_000_000_000, null, 143176],
    ],
  },
};
const JP_TOP_STEP = 500_000_000;
const JP_TOP_ADD = 33000;
const DAILY_STEP = 3_000_000;
const DAILY_FEE = 3300;

const US_DOMESTIC = [
  [1_000_000, 0.00891, 0],
  [3_000_000, 0.00792, 990],
  [5_000_000, 0.006435, 5445],
  [10_000_000, 0.00594, 7920],
  [30_000_000, 0.00495, 17820],
  [50_000_000, 0.00396, 47520],
  [100_000_000, 0.003465, 72270],
  [Infinity, 0.00297, 121770],
];
const US_LOCAL = 0.0025;
const SEC_RATE = 0.0000206;

const HK_DOMESTIC = {
  consulting: [
    [1_000_000, 0.007425, 0],
    [3_000_000, 0.0066, 825],
    [5_000_000, 0.005357, 4554],
    [10_000_000, 0.00495, 6589],
    [30_000_000, 0.004125, 14839],
    [50_000_000, 0.0033, 39589],
    [100_000_000, 0.002882, 60489],
    [Infinity, 0.002475, 101189],
  ],
  direct: [
    [1_000_000, 0.00297, 0],
    [3_000_000, 0.00264, 330],
    [5_000_000, 0.002145, 1815],
    [10_000_000, 0.00198, 2640],
    [30_000_000, 0.00165, 5940],
    [50_000_000, 0.00132, 15840],
    [100_000_000, 0.001155, 24090],
    [Infinity, 0.00099, 40590],
  ],
};
const HK_LOCAL = { consulting: 0.00375, direct: 0.0015 };
const HK_LOCAL_MIN = 50;
const HK_STAMP = 0.001;
const HK_SFC = 0.000027;
const HK_TRADING = 0.0000565;

// Yen per unit, each conversion (為替スプレッド一覧).
const FX_SEN = { USD: 0.5, HKD: 0.12 };

const JAPAN_MICS = new Set(["XTKS", "XNGO"]);
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE", "IEXG"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function inCurrency(amount, from, to) {
  if (code(from) === code(to)) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

export function planOf(id = DEFAULT_PLAN) {
  return PLANS.find((p) => p.id === String(id || DEFAULT_PLAN).toLowerCase()) || null;
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
      if (loose(m.row.exchange) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function linear(amount, steps) {
  for (const [upTo, rate, add] of steps) {
    if (amount <= upTo) return rate == null ? add : amount * rate + add;
  }
  return null;
}

// One domestic order, tax included, truncated to the yen.
function japanLeg(yen, course) {
  if (!(yen > 0)) return null;
  const table = JP[course];
  const top = table.steps.at(-1);
  let fee = yen <= top[0] ? linear(yen, table.steps) : top[2] + JP_TOP_ADD * Math.ceil((yen - top[0]) / JP_TOP_STEP - 1e-12);
  fee = Math.floor(fee + 1e-9);
  return Math.max(fee, table.min);
}

function dailyYen(day) {
  if (!(day > 0)) return null;
  return DAILY_FEE * Math.ceil(day / DAILY_STEP - 1e-12);
}

const nearestCent = (x) => Math.round(x * 100 + 1e-9) / 100;
const truncCent = (x) => Math.floor(x * 100 + 1e-9) / 100;

// HKEX charges Daiwa lists, one side.
function hkCharges(hkd, type) {
  const stamp = type === "ETF" || type === "ETN" ? 0 : Math.ceil(hkd * HK_STAMP - 1e-9);
  return stamp + nearestCent(hkd * HK_SFC) + nearestCent(hkd * HK_TRADING);
}

function fxRemarkOf(currency) {
  const sen = FX_SEN[currency];
  const unit = usdPer(currency);
  const yen = usdPer("JPY");
  if (sen == null || !(unit > 0) || !(yen > 0)) return fxRemark("", currency);
  return fxRemark(((sen / (unit / yen)) * 100).toFixed(3), currency);
}

const fmtPct = (x) => `${String(Number((x * 100).toPrecision(6))).replace(".", ",")} %`;

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
    cashCurrency: "JPY",
    remark: "",
    url: SCHEDULE.url,
  };
  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (${PLANS.map((p) => p.id).join("|")})` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Daiwa n'existe pas encore : lancer `node brokers/daiwa/daiwa_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Daiwa` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Daiwa`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "daiwa",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? (m.row.mic || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const mic = code(m.row.mic || listing.mic);
  const japan = JAPAN_MICS.has(mic) && listing.currency === "JPY";
  const american = US_MICS.has(mic) && listing.currency === "USD";
  const hongKong = mic === "XHKG" && listing.currency === "HKD";
  if (!japan && !american && !hongKong) {
    return { ...answer, listing, why: `${listing.brokerExchange} ${listing.currency} n'a pas de ligne dans le barème Daiwa` };
  }
  // The daily flat fee covers domestic shares only; US and HK pay Direct.
  const course = picked.id === "consulting" ? "consulting" : "direct";
  const daily = japan && picked.id === "daily";

  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const remark = japan ? "" : fxRemarkOf(listing.currency);
  const basis = japan
    ? daily
      ? `barème Daiwa, ${picked.label}, relu le ${SCHEDULE.readOn} : 3 300 ¥ par tranche entamée de 3 000 000 ¥ par jour, TTC ; l'aller-retour du jour compte l'achat et la vente`
      : course === "consulting"
        ? `barème Daiwa, ${picked.label}, internet, relu le ${SCHEDULE.readOn} : 0,9482 % jusqu'à 1 M¥ puis dégressif, min 2 090 ¥, TTC, tronqué au yen`
        : `barème Daiwa, ${picked.label}, internet, relu le ${SCHEDULE.readOn} : 0,3795 % jusqu'à 1 M¥ puis dégressif, min 1 100 ¥, TTC, tronqué au yen`
    : american
      ? `barème US Daiwa, internet, relu le ${SCHEDULE.readOn} : 取次 0,891 % jusqu'à 1 M¥ puis dégressif (sur la valeur en yens) + local 0,25 % ; SEC 20,60 $ par million à la vente (${SCHEDULE.secOn})`
      : `barème Hong Kong Daiwa, ${course === "consulting" ? "コンサルティング" : "ダイレクト"}, internet, relu le ${SCHEDULE.readOn} : 取次 ${course === "consulting" ? "0,7425" : "0,297"} % jusqu'à 1 M¥ puis dégressif + local ${course === "consulting" ? "0,375" : "0,15"} %, min 50 HKD ; timbre 0,1 % hors ETF, 取引所税 0,0027 %, 取引所手数料 0,00565 %`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: japan ? "JPY" : listing.currency,
    remark,
    basis,
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
  if (american) {
    const quoted = usBookPerShare({ broker: "daiwa", ticker: listing.ticker, fallback: marketPerShare });
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

  let commissionUsd = null;
  let placeUsd = 0;
  let commission;
  if (japan) {
    const yen = daily ? dailyYen(notional * 2) : plus(japanLeg(notional, course), japanLeg(notional, course));
    commissionUsd = yen == null ? null : dollars(yen, "JPY");
    commission = daily
      ? { perDay: yen, dayAmount: notional * 2, currency: "JPY", plan: picked.id }
      : { perOrder: japanLeg(notional, course), currency: "JPY", eachWay: true, plan: picked.id };
  } else if (american) {
    const yen = inCurrency(notional, "USD", "JPY");
    const domesticYen = yen == null ? null : linear(yen, US_DOMESTIC);
    const domesticUsd = domesticYen == null ? null : dollars(domesticYen, "JPY");
    const localUsd = notional * US_LOCAL;
    const legUsd = domesticUsd == null ? null : domesticUsd + localUsd;
    commissionUsd = legUsd == null ? null : legUsd * 2;
    placeUsd = notional * SEC_RATE;
    commission = { domesticYen, local: US_LOCAL, currency: "USD", eachWay: true, plan: picked.id };
  } else {
    const yen = inCurrency(notional, "HKD", "JPY");
    const domesticYen = yen == null ? null : linear(yen, HK_DOMESTIC[course]);
    const domesticUsd = domesticYen == null ? null : dollars(domesticYen, "JPY");
    const localHkd = Math.max(HK_LOCAL_MIN, truncCent(notional * HK_LOCAL[course]));
    const legUsd = domesticUsd == null ? null : domesticUsd + dollars(localHkd, "HKD");
    commissionUsd = legUsd == null ? null : legUsd * 2;
    placeUsd = dollars(hkCharges(notional, listing.type) * 2, "HKD");
    commission = { domesticYen, local: HK_LOCAL[course], localMin: HK_LOCAL_MIN, localHkd, currency: "HKD", eachWay: true, plan: picked.id };
  }
  const taxUsd = notionalUsd == null ? null : plus(notionalUsd * taxTotal, placeUsd);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    basis,
    japan ? "ligne en yens : pas de change" : "change hors du chiffre (devise de dépôt)",
    american ? "aucun courtier US nommé : NBBO coté" : "",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission,
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
          japan: JP,
          daily: "3300 JPY for each started 3M JPY of the day, tax included; buy and sell of the trip on one day",
          us: { domestic: US_DOMESTIC.map(([u, r, a]) => [u, fmtPct(r), a]), local: US_LOCAL, sec: SEC_RATE },
          hongKong: { domestic: HK_DOMESTIC, local: HK_LOCAL, localMin: HK_LOCAL_MIN, stamp: HK_STAMP, sfc: HK_SFC, trading: HK_TRADING },
          fxSen: FX_SEN,
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
      "usage : node brokers/daiwa/daiwa_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=consulting|direct|daily] [--json]"
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
