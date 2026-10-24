// What one round trip costs at Aizawa Securities (アイザワ証券), Blue Trade
// account (ブルートレード口座), internet and mobile orders: buy n shares at
// price p, sell them back at once, in dollars. The call-centre and
// コンサルネット (adviser) columns, the face-to-face account, odd lots and
// margin stay out.
//
// Read 2026-10-23.
//
//   Japan, cash, one order, tax included (インターネット・モバイル発注)
//     up to 500 000 ¥                  814 ¥
//     above, up to 30 000 000 ¥      1 650 ¥   (one order is capped at
//                                               30 000 000 ¥)
//   Foreign shares (Hong Kong, Shanghai and Shenzhen B, Stock Connect A,
//   Korea, Taiwan, Singapore, Thailand, Malaysia, Indonesia, Philippines,
//   Vietnam), one order, tax included
//     1.65 % of the local trade amount ("売買代金の 1.65%")
//     minimum 5 500 ¥ on a buy only ("買いの場合のみ、最低手数料を5,500円")
//     local charges are inside the commission ("現地諸費用等は委託手数料に
//     含まれております"), so no stamp, levy or transaction tax is added
//
// Conversion (為替スプレッド, yen per unit, each way):
//   USD 0.50, HKD 0.15, CNY 0.30, KRW 0.10 per 100, TWD 0.08, SGD 0.83,
//   IDR 0.03 per 100, THB 0.08, PHP 0.07, MYR 0.43, VND 0.20 per 1 000.
// The account holds JPY, USD, HKD, EUR, AUD, NZD, TRY, MXN and ZAR
// (../../deposits.mjs). A Hong Kong dollar or US dollar line (HKEX, Shenzhen
// B, Shanghai B, the HKEX dollar counters) gets the spread as a remark.
// Every other currency is converted both ways inside the number; offshore
// yuan (CNH, HKEX yuan counters and Stock Connect) takes the 人民元 0.30 ¥.
//
//   https://www.aizawa.co.jp/service/commission/
//   https://www.aizawa.co.jp/products/asia/china/
//   https://www.aizawa.co.jp/products/asia/notes/
//
//   node brokers/aizawa/aizawa_cost.mjs 7203 Tokyo JPY --shares=50 --price=3000
//   node brokers/aizawa/aizawa_cost.mjs HK0700001018 HKEX HKD --shares=20 --price=390
//   node brokers/aizawa/aizawa_cost.mjs KR7005930003 "Korea Exchange" KRW --shares=20 --price=70000
//   node brokers/aizawa/aizawa_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("aizawa-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.aizawa.co.jp/service/commission/",
  foreign: "https://www.aizawa.co.jp/products/asia/china/",
  rules: "https://www.aizawa.co.jp/products/asia/notes/",
  readOn: "2026-10-23",
  entity: "アイザワ証券 ブルートレード口座",
};

// Japan, internet and mobile, tax included: [upper bound in yen, fee in yen].
const JP_STEPS = [
  [500_000, 814],
  [30_000_000, 1_650],
];
const FOREIGN_RATE = 0.0165;
const FOREIGN_BUY_MIN_YEN = 5_500;
const ORDER_CAP_YEN = 30_000_000;

// Yen per `per` units of the currency, each way.
const FX_YEN = {
  USD: { yen: 0.5, per: 1 },
  HKD: { yen: 0.15, per: 1 },
  CNY: { yen: 0.3, per: 1 },
  CNH: { yen: 0.3, per: 1 },
  KRW: { yen: 0.1, per: 100 },
  TWD: { yen: 0.08, per: 1 },
  SGD: { yen: 0.83, per: 1 },
  IDR: { yen: 0.03, per: 100 },
  THB: { yen: 0.08, per: 1 },
  PHP: { yen: 0.07, per: 1 },
  MYR: { yen: 0.43, per: 1 },
  VND: { yen: 0.2, per: 1000 },
};

const JAPAN = new Set(["TOKYO", "NAGOYA", "FUKUOKA", "SAPPORO"]);
const FOREIGN_MICS = new Set([
  "XHKG", "XSHG", "XSHE", "XKRX", "XKOS", "XTAI", "ROCO", "XSES", "XBKK", "XKLS", "XIDX", "XPHS", "XSTC", "HSTC", "UPCM",
]);

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

function japanYen(notional) {
  if (!(notional > 0)) return null;
  for (const [upTo, fee] of JP_STEPS) if (notional <= upTo) return fee;
  return null;
}

// Each way, as a fraction of the listing amount.
function fxFraction(currency) {
  const spec = FX_YEN[code(currency)];
  const unit = usdPer(currency);
  const jpy = usdPer("JPY");
  if (!spec || !(unit > 0) || !(jpy > 0)) return null;
  return ((spec.yen / spec.per) * jpy) / unit;
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
    return { ...answer, why: "le catalogue Aizawa n'existe pas encore : lancer `node brokers/aizawa/aizawa_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Aizawa` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Aizawa`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "aizawa",
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
  const japan = JAPAN.has(loose(listing.brokerExchange)) && listing.currency === "JPY";
  const foreign = !japan && FOREIGN_MICS.has(code(m.row.mic || listing.mic));
  if (!japan && !foreign) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const held = japan || depositHas("aizawa", null, listing.currency);
  const fxEach = japan ? 0 : fxFraction(listing.currency);
  const remark = !japan && held ? fxRemark(fxEach == null ? "" : (fxEach * 100).toFixed(3), listing.currency) : "";
  // Japan has no stamp; abroad the local charges are inside the commission.
  const tax = japan ? taxesOf(listing.isin) : { known: true, buy: {}, sell: {}, inCommission: true };
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? listing.currency : "JPY",
    remark,
    url: japan ? SCHEDULE.url : SCHEDULE.foreign,
    basis: japan
      ? `barème ブルートレード, ordre internet, lu le ${SCHEDULE.readOn} : 814 ¥ jusqu'à 500 000 ¥, 1 650 ¥ au-delà, par ordre, TTC`
      : `barème ブルートレード actions étrangères, ordre internet, lu le ${SCHEDULE.readOn} : 1,65 % TTC du montant local par ordre, minimum 5 500 ¥ à l'achat seulement, frais locaux compris`,
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
  const notionalYen = japan ? notional : yenOf(notional, listing.currency);
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

  let commissionUsd;
  let commission;
  let buyYen = null;
  let sellYen = null;
  if (japan) {
    const one = japanYen(notional);
    buyYen = one;
    sellYen = one;
    commissionUsd = one == null ? null : dollars(one * 2, "JPY");
    commission = { perOrder: one, currency: "JPY", eachWay: true };
  } else {
    const pct = notionalYen == null ? null : notionalYen * FOREIGN_RATE;
    buyYen = pct == null ? null : Math.max(pct, FOREIGN_BUY_MIN_YEN);
    sellYen = pct;
    commissionUsd = buyYen == null || sellYen == null ? null : dollars(buyYen + sellYen, "JPY");
    commission = { rate: FOREIGN_RATE, buyMin: FOREIGN_BUY_MIN_YEN, minCurrency: "JPY", eachWay: true, localChargesIncluded: true };
  }
  const tooBig = notionalYen != null && notionalYen > ORDER_CAP_YEN;
  const fxUsd = held ? 0 : fxEach == null || notionalUsd == null ? null : notionalUsd * fxEach * 2;
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = tooBig ? null : plus(bookUsd, brokerFees, fxUsd, taxUsd);
  const confidence = [
    shared.basis,
    japan
      ? "ligne en yens : pas de change"
      : held
        ? `compte en ${listing.currency} : change hors du chiffre`
        : `${listing.currency} n'est pas une devise de dépôt : change ${FX_YEN[listing.currency]?.yen ?? "?"} ¥ pour ${FX_YEN[listing.currency]?.per ?? "?"} ${listing.currency} dans chaque sens, dans le chiffre`,
    japan ? "pas de droit de timbre au Japon" : "timbre, taxes et frais de place compris dans la commission (現地諸費用等は委託手数料に含まれております)",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  const why = tooBig
    ? `un ordre internet ブルートレード est plafonné à ${ORDER_CAP_YEN.toLocaleString("fr-FR")} ¥ : il faudrait le scinder`
    : bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : !held && fxUsd == null
        ? `pas d'écart de change publié pour ${listing.currency}`
        : null;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { ...commission, buyYen, sellYen },
    bp: marketBp,
    perShare: marketPerShare,
    ...(why ? { why } : {}),
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
      ...(held ? {} : { change: finite(fxUsd, 6) }),
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
          japan: "Blue Trade internet: 814 JPY up to 500k, 1650 JPY up to 30M, per order, tax included",
          foreign: "Blue Trade internet: 1.65 % of the local amount per order, tax included, min 5500 JPY on a buy only, local charges included",
          conversion: "yen per unit each way: " + Object.entries(FX_YEN).map(([c, s]) => `${c} ${s.yen}/${s.per}`).join(", "),
          inTotal: "FX in the number when the currency is not a deposit currency (deposits.mjs aizawa); remark otherwise",
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
    console.error("usage : node brokers/aizawa/aizawa_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.change != null) console.log(`  change         : ${parts.change} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
