// What one round trip costs at Mitsubishi UFJ Morgan Stanley Securities:
// buy n shares at price p, sell them back at once, in dollars. Online
// trade (インターネットトレード) on the MUFGテラス・コース, the course an account
// opened on the web gets. The コンサルティング取引コース (branch, 50 % off), the
// phone line, the call centre, the branch, ネット信用 and NISA stay out.
//
// Read 2026-10-18.
//
//   Japan, one order, tax included, MUFGテラス・コース, online column
//     up to 2 500 ¥                   66.0 % of the amount
//     up to 385 000 ¥                 1 650 ¥
//     up to 500 000 ¥                 0.429 %
//     up to 1 000 000 ¥               0.3036 % + 627 ¥
//     up to 5 000 000 ¥               0.2607 % + 1 056 ¥
//     up to 10 000 000 ¥              0.2079 % + 3 696 ¥
//     up to 30 000 000 ¥              0.1716 % + 7 326 ¥
//     up to 50 000 000 ¥              0.066 % + 39 006 ¥
//     above                           0.0165 % + 63 756 ¥
//     (70 % off the basic table. The cell 1 650 ¥ spans 2 500 ¥ to
//     385 000 ¥: 1 650 / 0.429 % = 384 615 ¥.)
//     Tokyo, Nagoya, Fukuoka and Sapporo are all on the online list.
//   United States and Hong Kong, 外国委託取引, one order
//     国内取次手数料 on the yen amount, tax included
//       up to 1 000 000 ¥             1.10 %
//       up to 3 000 000 ¥             0.99 % + 1 100 ¥
//       up to 5 000 000 ¥             0.88 % + 4 400 ¥
//       ... (the table runs to 0.33 % + 218 900 ¥ above 100 000 000 ¥)
//     plus 現地委託手数料, the local broker's commission. The firm writes
//     that this amount depends on the market at the time and cannot be
//     stated in advance. Local taxes and charges come on top.
//     The 約定金額 the domestic fee runs on includes the local fees and
//     taxes: added on a buy, taken off on a sale (上場有価証券等書面).
//     Online, a buy is a limit order of at least 300 000 ¥ and settles in
//     dollars or Hong Kong dollars only.
//
// The local commission is part of the ticket and is not published, so a US
// or Hong Kong line answers N/A, with the parts that are published listed
// beside it. The online-discount page names 株式など without saying whether
// the foreign 国内取次手数料 is discounted; the table above is undiscounted.
//
// Where the local commission was looked for, 2026-10-18:
//   - fee page, product page (about_buy.html), 外国株式投資のはじめ方: the
//     same "cannot be stated in advance" sentence.
//   - 上場有価証券等書面 3709-2170 (26.06), the 37条の3 document, 別表 2:
//     the same sentence, and note ※2 says the same of 現地諸費用.
//   - online buy guide fstock_buy.pdf (2022-11): the estimate is "注文単価
//     ×注文数量×1.00015 + 現地委託手数料・現地諸税 + 国内取次手数料 + 消費税
//     相当額", the local part with no rate. The US and HK stock lists, the
//     online foreign-stock page and faq.sc.mufg.jp (外国株式, 手数料, 現地
//     手数料) carry no rate either.
//   - The fee page did print a local table until at least 2019-07-21
//     (Wayback): 米国 0.25 %, 香港 and others 0.50 %, 上海 0.22 %, 深セン
//     0.30 %. By 2021-09-18 the table had been replaced by the present
//     sentence. A withdrawn rate is not the price of today's trade, so it
//     is not used.
//   - Third parties, not used: tsuker.net (updated 2025-02-01) still
//     quotes 0.25 % / 0.50 %, the old MUFG table; crexgroup.com (updated
//     2025-12-01) quotes 1.10 % (min 2 750 ¥) US and 1.375 % (min 5 500 ¥)
//     Hong Kong for the consulting course, without splitting the parts.
// The Hong Kong statutory charges (stamp, SFC, AFRC, trading fee, CCASS,
// see monexjp_cost.mjs) are public, but without the commission they still
// make no total.
//
// The account holds dollars, Hong Kong dollars and yuan (外貨お預かり金).
// Online conversion is the 外貨振替 rate: 25 sen per dollar, 10 sen per Hong
// Kong dollar, 20 sen per yuan, each way, below the large-amount line.
// The remark is that amount over the currency mid. The firm names no US
// executing broker, so a US book would be the quoted NBBO.
//
//   https://www.sc.mufg.jp/service/style/mufgterrace/index.html
//   https://www.sc.mufg.jp/service/commission/d_stock/index.html
//   https://www.sc.mufg.jp/trade/commission/index.html
//   https://www.sc.mufg.jp/trade/deal/st_etf_reit/index.html
//   https://www.sc.mufg.jp/service/commission/f_stock/index.html
//   https://www.sc.mufg.jp/products/stock/f_stock/about_buy.html
//   https://www.sc.mufg.jp/trade/deal/f_stock/index.html
//   https://www.sc.mufg.jp/its/pdf/fstock_buy.pdf
//   https://www.sc.mufg.jp/trade/deal/gaika/index.html
//   https://www.sc.mufg.jp/risk/pdf/3709-2170-26-06.pdf
//   https://www.sc.mufg.jp/learn/start/foreign_stock/index.html
//   https://faq.sc.mufg.jp/category/show/141?site_domain=default
//   https://web.archive.org/web/20190721210907/https://www.sc.mufg.jp/service/commission/f_stock/index.html
//
//   node brokers/mitsubishiufjmorgan/mitsubishiufjmorgan_cost.mjs 1301 Tokyo JPY --shares=100 --price=4000
//   node brokers/mitsubishiufjmorgan/mitsubishiufjmorgan_cost.mjs AAPL XNAS USD --shares=20 --price=230
//   node brokers/mitsubishiufjmorgan/mitsubishiufjmorgan_cost.mjs 1 HKEX HKD --shares=500 --price=50
//   node brokers/mitsubishiufjmorgan/mitsubishiufjmorgan_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("mitsubishiufjmorgan-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.sc.mufg.jp/service/style/mufgterrace/index.html",
  basic: "https://www.sc.mufg.jp/service/commission/d_stock/index.html",
  discount: "https://www.sc.mufg.jp/trade/commission/index.html",
  markets: "https://www.sc.mufg.jp/trade/deal/st_etf_reit/index.html",
  foreign: "https://www.sc.mufg.jp/service/commission/f_stock/index.html",
  foreignAbout: "https://www.sc.mufg.jp/products/stock/f_stock/about_buy.html",
  foreignOnline: "https://www.sc.mufg.jp/trade/deal/f_stock/index.html",
  foreignGuide: "https://www.sc.mufg.jp/its/pdf/fstock_buy.pdf",
  fx: "https://www.sc.mufg.jp/trade/deal/gaika/index.html",
  listedDocument: "https://www.sc.mufg.jp/risk/pdf/3709-2170-26-06.pdf",
  foreignLearn: "https://www.sc.mufg.jp/learn/start/foreign_stock/index.html",
  faq: "https://faq.sc.mufg.jp/category/show/141?site_domain=default",
  localWithdrawn: "https://web.archive.org/web/20190721210907/https://www.sc.mufg.jp/service/commission/f_stock/index.html",
  readOn: "2026-10-18",
  entity: "三菱ＵＦＪモルガン・スタンレー証券",
  course: "MUFGテラス・コース, インターネットトレード",
  venue: "not named",
};

// MUFGテラス・コース, online, tax included: [upper bound ¥, rate, add ¥]. A
// rate of null with an add is a flat fee.
const JP_STEPS = [
  [2_500, 0.66, 0],
  [385_000, null, 1_650],
  [500_000, 0.00429, 0],
  [1_000_000, 0.003036, 627],
  [5_000_000, 0.002607, 1_056],
  [10_000_000, 0.002079, 3_696],
  [30_000_000, 0.001716, 7_326],
  [50_000_000, 0.00066, 39_006],
  [Infinity, 0.000165, 63_756],
];
// 国内取次手数料, tax included, on the yen amount.
const FOREIGN_STEPS = [
  [1_000_000, 0.011, 0],
  [3_000_000, 0.0099, 1_100],
  [5_000_000, 0.0088, 4_400],
  [10_000_000, 0.0077, 9_900],
  [30_000_000, 0.0066, 20_900],
  [50_000_000, 0.0055, 53_900],
  [100_000_000, 0.0044, 108_900],
  [Infinity, 0.0033, 218_900],
];
const FOREIGN_MIN_BUY = 300_000;
// Online 外貨振替, yen per unit, each way, below the large-amount line.
const FX_YEN = { USD: 0.25, HKD: 0.1, CNH: 0.2, CNY: 0.2 };
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const JAPAN = new Set(["TOKYO", "NAGOYA", "FUKUOKA", "SAPPORO"]);
const HONG_KONG = new Set(["HKEX"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function yenOf(amount, currency) {
  if (code(currency) === "JPY") return Number(amount);
  const usd = toUsd(amount, currency);
  const per = usdPer("JPY");
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

function stepFee(yen, steps) {
  if (!(yen > 0)) return null;
  for (const [upTo, rate, add] of steps) {
    if (yen <= upTo) return Math.floor((rate == null ? 0 : yen * rate) + add);
  }
  return null;
}

function fxRemarkOf(currency) {
  const yen = FX_YEN[currency];
  if (yen == null) return "";
  const unit = usdPer(currency);
  const jpy = usdPer("JPY");
  if (!(unit > 0) || !(jpy > 0)) return fxRemark("", currency);
  return fxRemark(((yen / (unit / jpy)) * 100).toFixed(3), currency);
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
  };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue MUFG Morgan Stanley n'existe pas encore : lancer `node brokers/mitsubishiufjmorgan/mitsubishiufjmorgan_scraping.mjs`",
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue MUFG Morgan Stanley` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez MUFG Morgan Stanley`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "mitsubishiufjmorgan",
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
  const japan = JAPAN.has(market);
  const american = US_MICS.has(market) && listing.currency === "USD";
  const hongKong = HONG_KONG.has(market);
  if (!japan && !american && !hongKong) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const remark = japan ? "" : fxRemarkOf(listing.currency);
  const shared = {
    ...answer,
    listing,
    cashCurrency: japan ? "JPY" : listing.currency,
    remark,
    url: japan ? SCHEDULE.url : SCHEDULE.foreign,
    basis: japan
      ? `MUFGテラス・コース en ligne, lu le ${SCHEDULE.readOn} : 66 % jusqu'à 2 500 ¥, 1 650 ¥ jusqu'à 385 000 ¥, puis 0,429 % jusqu'à 500 000 ¥, 0,3036 % + 627 ¥ jusqu'à 1 000 000 ¥, TTC par ordre`
      : `外国委託取引 MUFG Morgan Stanley, lu le ${SCHEDULE.readOn} : 国内取次手数料 1,10 % TTC jusqu'à 1 000 000 ¥ plus 現地委託手数料 non publié`,
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

  if (!japan) {
    // The local broker's commission is not published: no total. What is
    // published is kept beside the N/A.
    const yen = yenOf(notional, listing.currency);
    const domesticYen = stepFee(yen, FOREIGN_STEPS);
    const domesticUsd = domesticYen == null ? null : dollars(domesticYen * 2, "JPY");
    const tooSmall = yen != null && yen < FOREIGN_MIN_BUY;
    const unpublished =
      "le 現地委託手数料 (commission du courtier local) n'est pas publié : « ne peut être indiqué à l'avance » " +
      "(page des frais, page produit, 上場有価証券等書面 26.06, guide d'achat en ligne, FAQ, lus le " +
      `${SCHEDULE.readOn}) ; l'ancien barème (US 0,25 %, HK 0,50 %) a été retiré entre 2019 et 2021`;
    return {
      ...shared,
      why: tooSmall
        ? `achat en ligne d'au moins ${FOREIGN_MIN_BUY.toLocaleString("fr-FR")} ¥ par ordre ; et ${unpublished}`
        : `${unpublished} ; taxes et frais locaux en plus`,
      commission: {
        domestic: FOREIGN_STEPS.map(([upTo, rate, add]) => ({ upTo, rate, add })),
        local: null,
        currency: "JPY",
        eachWay: true,
        minBuyYen: FOREIGN_MIN_BUY,
      },
      trade: {
        shares: n,
        price: p,
        notional,
        notionalUsd: finite(notionalUsd, 6),
        currency: listing.currency,
      },
      published: {
        国内取次手数料: finite(domesticUsd, 6),
        現地委託手数料: null,
      },
      confidence: [
        shared.basis,
        "commission locale non publiée : pas de total",
        "règlement en devise seulement en ligne ; change hors du chiffre",
        american
          ? "courtier américain non nommé ; frais SEC non chiffrés faute de total"
          : "taxes et frais HKEX publics (timbre, SFC, AFRC, négociation, CCASS) mais non chiffrés faute de commission",
      ].join(" ; "),
    };
  }

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
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const one = stepFee(notional, JP_STEPS);
  const commissionUsd = one == null ? null : dollars(one * 2, "JPY");
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    "MUFGテラス・コース, ouverte en ligne ; pas la コンサルティング取引コース",
    "ligne en yens : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { perOrder: one, currency: "JPY", eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
        }
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
          japan: "MUFG Terrace course, online, per order, tax included: 66 % up to 2500 JPY, 1650 up to 385000, 0.429 % up to 500000, 0.3036 % + 627 up to 1M, 0.2607 % + 1056 up to 5M, 0.2079 % + 3696 up to 10M, 0.1716 % + 7326 up to 30M, 0.066 % + 39006 up to 50M, 0.0165 % + 63756 above",
          foreignFee: "US and Hong Kong: 国内取次手数料 1.10 % up to 1M JPY ... 0.33 % + 218900 above 100M, plus a local commission that is not published (fee page, product page, 上場有価証券等書面 26.06, online guide, FAQ, read 2026-10-18; the old 0.25 % US / 0.50 % HK table was withdrawn between 2019-07 and 2021-09): N/A",
          minBuy: "300000 JPY per online foreign buy, limit orders, foreign-currency settlement only",
          conversion: "remark only: online 外貨振替 USD 0.25, HKD 0.10, CNY/CNH 0.20 JPY each way",
          rule606: "none named",
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
      "usage : node brokers/mitsubishiufjmorgan/mitsubishiufjmorgan_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]"
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
    if (out.published) {
      console.log(`  publié seulement : 国内取次手数料 ${show(out.published.国内取次手数料)} $, 現地委託手数料 N/A`);
    }
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
