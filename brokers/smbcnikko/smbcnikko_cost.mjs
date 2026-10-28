// What one round trip costs at SMBC Nikko Securities (SMBC日興証券): buy n
// shares at price p, sell them back at once, in dollars. Online trade (日興
// イージートレード), cash orders. Branch, order line (ご注文専用ダイヤル),
// てれトレ, margin, odd lots, るいとう and NISA stay out.
//
// Fee pages read 2026-10-26. The client holds one of two courses ("2つのお
// 取引コース"), each with its own online column, so there are two plans
// (`plan`):
//   direct  ダイレクトコース. The default.
//   sogo    総合コース, オンライントレード column ("支店の30％割引").
//
//   Japan (Tokyo, Nagoya: shares, 優先出資証券, ETFs, foreign ETFs and ETNs
//   alike, "国内上場株式等"), one order, tax included
//     direct  up to 100 000 ¥ 137, 200 000 198, 300 000 275, 500 000 440,
//             1M 880, 2M 1 650, 3M 2 200, 5M 3 300, 10M 4 950,
//             20M 9 900, 30M 16 500, above 30M 27 500
//     sogo    0.8855 % up to 1M ¥ (minimum 1 925 ¥), 0.6930 % + 1 925 to
//             2M, 0.6160 % + 3 465 to 3M, 0.5775 % + 4 620 to 4M,
//             0.5390 % + 6 160 to 5M, 0.4620 % + 10 010 to 10M,
//             0.4235 % + 13 860 to 20M, 0.3850 % + 21 560 to 30M,
//             0.2310 % + 67 760 to 50M, 192 500 above
//     The Sogo course's 一口注文 (same-day same-side orders in one name
//     priced as one) does not change a single round trip.
//   United States (日興イージートレード米国株式), one order, tax included
//     direct  0.495 % of the 売買金額, no minimum, capped at 22 USD
//     sogo    0.8855 % below 1M ¥ of 売買金額, then a step table in yen
//             (8 855 ¥ from 1M, 9 163 from 1.05M ... 209 825 from 50M,
//             296 450 from 100M ... 796 950 from 500M), the yen fee
//             turned back into dollars
//     外国手数料 none online, 外国税 none
//     賦課金   on the sale, 0.00206 % of the dollar trade, rounded up to
//             the cent (from 2026-04-02)
//   売買金額 is the trade plus or minus the local charges; the one local
//   charge is the sale's 賦課金, a few cents per 10 000 USD, and it is left
//   out of the base. No rounding is printed for the commissions: none is
//   applied.
//
// Cash: yen and fifteen currencies (deposits.mjs), USD among them, so a US
// line has no conversion in the number. The remark is the spread the US
// page publishes over the 日興外為基準レート mid, each way: 50 sen below
// 100 000 USD, 25 sen from 100 000 to 800 000 USD, taken at the order's
// size. 口座管理料 is nil.
//
// US orders: SMBC Nikko names no US broker-dealer, so the book is the
// quoted NBBO of the ticker (no Rule 606 mix).
//
//   https://www.smbcnikko.co.jp/service/fee/stock/
//   https://www.smbcnikko.co.jp/service/fee/fstock/usa/
//   https://www.smbcnikko.co.jp/products/stock/foreign/usa/online/
//   https://www.smbcnikko.co.jp/service/online/trade/fee/
//
//   node brokers/smbcnikko/smbcnikko_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000
//   node brokers/smbcnikko/smbcnikko_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000 --plan=sogo
//   node brokers/smbcnikko/smbcnikko_cost.mjs 2044 Tokyo JPY --shares=10 --price=7000
//   node brokers/smbcnikko/smbcnikko_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/smbcnikko/smbcnikko_cost.mjs AAPL XNAS USD --shares=100 --price=230 --plan=sogo
//   node brokers/smbcnikko/smbcnikko_cost.mjs --schedule
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

const CATALOGUE = new URL("smbcnikko-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.smbcnikko.co.jp/service/fee/stock/",
  us: "https://www.smbcnikko.co.jp/service/fee/fstock/usa/",
  usOnline: "https://www.smbcnikko.co.jp/products/stock/foreign/usa/online/",
  readOn: "2026-10-26",
  secOn: "2026-04-02",
  entity: "SMBC日興証券",
};

export const PLANS = [
  { id: "direct", label: "ダイレクトコース", name: "Direct course" },
  { id: "sogo", label: "総合コース", name: "Sogo course" },
];
const DEFAULT_PLAN = "direct";

// Direct course, online: [upper bound in yen, fee in yen].
const JP_DIRECT = [
  [100_000, 137],
  [200_000, 198],
  [300_000, 275],
  [500_000, 440],
  [1_000_000, 880],
  [2_000_000, 1650],
  [3_000_000, 2200],
  [5_000_000, 3300],
  [10_000_000, 4950],
  [20_000_000, 9900],
  [30_000_000, 16500],
  [Infinity, 27500],
];
// Sogo course, online: [upper bound in yen, rate, yen added]; null rate is flat.
const JP_SOGO = [
  [1_000_000, 0.008855, 0],
  [2_000_000, 0.00693, 1925],
  [3_000_000, 0.00616, 3465],
  [4_000_000, 0.005775, 4620],
  [5_000_000, 0.00539, 6160],
  [10_000_000, 0.00462, 10010],
  [20_000_000, 0.004235, 13860],
  [30_000_000, 0.00385, 21560],
  [50_000_000, 0.00231, 67760],
  [Infinity, null, 192500],
];
const JP_SOGO_MIN = 1925;

const US_DIRECT = { rate: 0.00495, cap: 22 };
// Sogo course, online: below 1M ¥ 0.8855 %; from each lower bound (yen) the fee in yen.
const US_SOGO_RATE = 0.008855;
const US_SOGO_STEPS = [
  [1_000_000, 8_855],
  [1_050_000, 9_163],
  [1_100_000, 9_548],
  [1_150_000, 9_856],
  [1_200_000, 10_241],
  [1_250_000, 10_549],
  [1_300_000, 10_934],
  [1_350_000, 11_242],
  [1_400_000, 11_627],
  [1_450_000, 11_935],
  [1_500_000, 12_320],
  [1_600_000, 13_013],
  [1_700_000, 13_706],
  [1_800_000, 14_399],
  [1_900_000, 15_092],
  [2_000_000, 15_785],
  [2_200_000, 17_171],
  [2_400_000, 18_557],
  [2_600_000, 19_943],
  [2_800_000, 21_329],
  [3_000_000, 22_715],
  [3_250_000, 24_409],
  [3_500_000, 26_180],
  [3_750_000, 27_874],
  [4_000_000, 29_645],
  [4_250_000, 31_339],
  [4_500_000, 33_110],
  [4_750_000, 34_804],
  [5_000_000, 36_575],
  [5_500_000, 39_270],
  [6_000_000, 41_965],
  [6_500_000, 44_660],
  [7_000_000, 47_355],
  [7_500_000, 50_050],
  [8_000_000, 52_745],
  [8_500_000, 55_440],
  [9_000_000, 58_135],
  [9_500_000, 60_830],
  [10_000_000, 63_525],
  [11_000_000, 67_914],
  [12_000_000, 72_380],
  [13_000_000, 76_769],
  [14_000_000, 81_235],
  [15_000_000, 85_624],
  [16_000_000, 90_090],
  [17_000_000, 94_479],
  [18_000_000, 98_945],
  [19_000_000, 103_334],
  [20_000_000, 107_800],
  [21_000_000, 112_189],
  [22_000_000, 116_655],
  [23_000_000, 121_044],
  [24_000_000, 125_510],
  [25_000_000, 129_899],
  [26_000_000, 134_365],
  [27_000_000, 138_754],
  [28_000_000, 143_220],
  [29_000_000, 147_609],
  [30_000_000, 152_075],
  [32_000_000, 157_850],
  [34_000_000, 163_625],
  [36_000_000, 169_400],
  [38_000_000, 175_175],
  [40_000_000, 180_950],
  [42_000_000, 186_725],
  [44_000_000, 192_500],
  [46_000_000, 198_275],
  [48_000_000, 204_050],
  [50_000_000, 209_825],
  [60_000_000, 227_150],
  [70_000_000, 244_475],
  [80_000_000, 261_800],
  [90_000_000, 279_125],
  [100_000_000, 296_450],
  [200_000_000, 450_450],
  [300_000_000, 604_450],
  [400_000_000, 700_700],
  [500_000_000, 796_950],
];
const SEC_RATE = 0.0000206;
// Yen per dollar, each conversion: below 100 000 USD, then up to 800 000 USD.
const FX_SEN = [
  [100_000, 0.5],
  [Infinity, 0.25],
];

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

// One domestic online order, tax included, yen.
function japanLeg(yen, plan) {
  if (!(yen > 0)) return null;
  if (plan === "direct") {
    for (const [upTo, fee] of JP_DIRECT) if (yen <= upTo) return fee;
    return null;
  }
  for (const [upTo, rate, add] of JP_SOGO) {
    if (yen <= upTo) return Math.max(rate == null ? add : yen * rate + add, JP_SOGO_MIN);
  }
  return null;
}

// One US online order, tax included, in dollars.
function usLeg(notionalUsd, plan) {
  if (!(notionalUsd > 0)) return null;
  if (plan === "direct") return Math.min(notionalUsd * US_DIRECT.rate, US_DIRECT.cap);
  const yen = inCurrency(notionalUsd, "USD", "JPY");
  if (yen == null) return null;
  let fee = yen * US_SOGO_RATE;
  for (const [from, step] of US_SOGO_STEPS) if (yen >= from) fee = step;
  return inCurrency(fee, "JPY", "USD");
}

// 0.00206 % of the dollar sale, rounded up to the cent.
function secFee(notionalUsd) {
  if (!(notionalUsd > 0)) return 0;
  return Math.ceil(notionalUsd * SEC_RATE * 100 - 1e-9) / 100;
}

function fxRemarkUsd(notionalUsd) {
  const yen = usdPer("JPY");
  if (!(yen > 0)) return fxRemark("", "USD");
  const sen = FX_SEN.find(([upTo]) => notionalUsd < upTo)?.[1] ?? FX_SEN.at(-1)[1];
  return fxRemark((sen * yen * 100).toFixed(3), "USD");
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
    cashCurrency: "JPY",
    remark: "",
    url: SCHEDULE.url,
  };
  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (${PLANS.map((p) => p.id).join("|")})` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue SMBC日興 n'existe pas encore : lancer `node brokers/smbcnikko/smbcnikko_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue SMBC日興` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez SMBC日興`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "smbcnikko",
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
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} ${listing.currency} n'a pas de ligne dans le barème SMBC日興` };
  }

  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const direct = picked.id === "direct";
  const basis = japan
    ? direct
      ? `barème SMBC日興, ${picked.label}, en ligne, relu le ${SCHEDULE.readOn} : 137 ¥ jusqu'à 100 000 ¥, 880 ¥ jusqu'à 1 M¥, 27 500 ¥ au-delà de 30 M¥, TTC, par ordre`
      : `barème SMBC日興, ${picked.label}, en ligne, relu le ${SCHEDULE.readOn} : 0,8855 % jusqu'à 1 M¥ puis dégressif, min 1 925 ¥, TTC, par ordre`
    : direct
      ? `barème US SMBC日興, ${picked.label}, relu le ${SCHEDULE.readOn} : 0,495 % TTC par ordre, plafond 22 USD ; 賦課金 0,00206 % à la vente arrondi au cent supérieur (${SCHEDULE.secOn})`
      : `barème US SMBC日興, ${picked.label}, en ligne, relu le ${SCHEDULE.readOn} : 0,8855 % sous 1 M¥ puis grille en yens, TTC ; 賦課金 0,00206 % à la vente arrondi au cent supérieur (${SCHEDULE.secOn})`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    url: japan ? SCHEDULE.url : SCHEDULE.us,
    basis,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return {
      ...shared,
      remark: japan ? "" : fxRemarkUsd(0),
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const remark = japan ? "" : fxRemarkUsd(notional);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american) {
    const quoted = usBookPerShare({ broker: "smbcnikko", ticker: listing.ticker, fallback: marketPerShare });
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

  let commissionUsd;
  let placeUsd = 0;
  let commission;
  if (japan) {
    const one = japanLeg(notional, picked.id);
    commissionUsd = one == null ? null : dollars(one * 2, "JPY");
    commission = { perOrder: one, currency: "JPY", eachWay: true, plan: picked.id };
  } else {
    const one = usLeg(notional, picked.id);
    commissionUsd = one == null ? null : one * 2;
    placeUsd = secFee(notional);
    commission = { perOrder: one, currency: "USD", eachWay: true, plan: picked.id };
  }
  const taxUsd = notionalUsd == null ? null : plus(notionalUsd * taxTotal, placeUsd);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    basis,
    japan ? "ligne en yens : pas de change" : "change hors du chiffre (dollar en dépôt)",
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
    remark,
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
          japan: { direct: JP_DIRECT, sogo: JP_SOGO, sogoMin: JP_SOGO_MIN },
          us: { direct: US_DIRECT, sogoRate: US_SOGO_RATE, sogoSteps: US_SOGO_STEPS.length, sec: SEC_RATE },
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
      "usage : node brokers/smbcnikko/smbcnikko_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=direct|sogo] [--json]"
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
