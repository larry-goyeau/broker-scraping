// What one round trip costs at Ando Securities: buy n shares at price p,
// sell them back at once, in dollars. Japanese shares on 美らネット24, the
// internet line. Phone orders through the 美らネット24 desk (2 200 ¥ and up)
// stay out. Campaign discounts stay out. Custody is not a ticket.
//
// Read 2026-10-18.
//
//   Japan, 美らネット24, internet order, one order a day, tax included
//     up to 200 000 ¥              110 ¥
//     up to 500 000 ¥              330 ¥
//     up to 1 000 000 ¥            550 ¥
//     up to 1 500 000 ¥            660 ¥
//     above                        990 ¥
//     The internet line serves Tokyo and Nagoya. There is no daily flat.
//   United States, face to face only (対面取引), 委託取引
//     Online, a US share can only be sold when it was moved in from another
//     channel; a buy is face to face. One order pays:
//       現地手数料   0.05 % of the amount, at least 5 USD
//       国内手数料   the face-to-face Japanese table, on the yen amount:
//         up to 500 000 ¥             1.216380 %
//         up to 1 000 000 ¥           1.184370 % + 159 ¥
//         up to 3 000 000 ¥           0.896280 % + 3 040 ¥
//         up to 5 000 000 ¥           0.842930 % + 4 640 ¥
//         up to 10 000 000 ¥          0.704220 % + 11 576 ¥
//         up to 30 000 000 ¥          0.554840 % + 26 514 ¥
//         up to 50 000 000 ¥          0.277420 % + 109 740 ¥
//         up to 100 000 000 ¥         0.096030 % + 200 435 ¥
//         above                       0.085360 % + 211 105 ¥
//         at least 2 750 ¥, tax included
//     The dollar rate is the firm's, plus or minus 50 sen per dollar.
//     The 店頭取引 line (a firm price within 2.5 % of the last close) is the
//     other choice and stays out. A foreign-securities account costs
//     3 300 ¥ a year while US shares are held; that is custody.
//
// A US line is priced, with onlineBuy false: the order is placed with a
// branch. Cash is yen only (deposits), so the 50 sen each way are in the
// number. The local broker is not named, so the book is the quoted NBBO.
// No SEC fee is named. These rows carry no stamp in the tax map.
//
//   https://www.ando-sec.co.jp/spot-stock/trading-guide/churanet24.html
//   https://www.ando-sec.co.jp/spot-stock/trading-guide/us_stocks.html
//   https://www.ando-sec.co.jp/spot-stock/trading-guide/face-to-face.html
//
//   node brokers/ando/ando_cost.mjs 1301 Tokyo JPY --shares=100 --price=4000
//   node brokers/ando/ando_cost.mjs 1319 Nagoya JPY --shares=10 --price=20000
//   node brokers/ando/ando_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/ando/ando_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("ando-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.ando-sec.co.jp/spot-stock/trading-guide/churanet24.html",
  us: "https://www.ando-sec.co.jp/spot-stock/trading-guide/us_stocks.html",
  faceToFace: "https://www.ando-sec.co.jp/spot-stock/trading-guide/face-to-face.html",
  readOn: "2026-10-18",
  entity: "安藤証券",
  venue: "local broker, not named",
};

// 美らネット24, internet, tax included: [upper bound ¥, fee ¥].
const NET_STEPS = [
  [200_000, 110],
  [500_000, 330],
  [1_000_000, 550],
  [1_500_000, 660],
  [Infinity, 990],
];
// Face-to-face table, tax included: [upper bound ¥, rate, add ¥].
const DESK_STEPS = [
  [500_000, 0.0121638, 0],
  [1_000_000, 0.0118437, 159],
  [3_000_000, 0.0089628, 3_040],
  [5_000_000, 0.0084293, 4_640],
  [10_000_000, 0.0070422, 11_576],
  [30_000_000, 0.0055484, 26_514],
  [50_000_000, 0.0027742, 109_740],
  [100_000_000, 0.00096030, 200_435],
  [Infinity, 0.0008536, 211_105],
];
const DESK_MIN = 2_750;
const US_LOCAL_RATE = 0.0005;
const US_LOCAL_MIN = 5;
const FX_YEN = 0.5;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const JAPAN = new Set(["TOKYO", "NAGOYA"]);

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

function netLeg(notional) {
  if (!(notional > 0)) return null;
  for (const [upTo, fee] of NET_STEPS) if (notional <= upTo) return fee;
  return null;
}

function deskLeg(yen) {
  if (!(yen > 0)) return null;
  for (const [upTo, rate, add] of DESK_STEPS) {
    if (yen <= upTo) return Math.max(DESK_MIN, Math.floor(yen * rate + add));
  }
  return null;
}

function localLeg(notionalUsd) {
  if (!(notionalUsd > 0)) return null;
  return Math.max(US_LOCAL_MIN, notionalUsd * US_LOCAL_RATE);
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
    return { ...answer, why: "le catalogue Ando n'existe pas encore : lancer `node brokers/ando/ando_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Ando` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Ando`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "ando",
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
  const american = US_MICS.has(market) && listing.currency === "USD";
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    onlineBuy: japan,
    remark: american ? "Buy at a branch only: online, a US share can only be sold after a transfer in." : "",
    url: japan ? SCHEDULE.url : SCHEDULE.us,
    basis: japan
      ? `美らネット24 Ando, lu le ${SCHEDULE.readOn} : 110 ¥ jusqu'à 200 000 ¥, 330 ¥ jusqu'à 500 000 ¥, 550 ¥ jusqu'à 1 000 000 ¥, 660 ¥ jusqu'à 1 500 000 ¥, 990 ¥ au-delà, TTC par ordre`
      : `委託取引 US Ando en agence, lu le ${SCHEDULE.readOn} : frais locaux 0,05 % (min 5 USD) plus barème agence japonais sur le montant en yens (1,21638 % jusqu'à 500 000 ¥, min 2 750 ¥ TTC), par ordre ; change ±50 sen`,
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
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && marketBp == null) {
    // The local broker is not named: the quoted NBBO of the name.
    const quoted = usBookPerShare({ broker: "ando", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;

  let commissionUsd;
  let fxUsd = 0;
  let commission;
  let localUsd = 0;
  let domesticUsd = 0;
  if (japan) {
    const one = netLeg(notional);
    commissionUsd = one == null ? null : dollars(one * 2, "JPY");
    commission = { perOrder: one, currency: "JPY", eachWay: true };
  } else {
    const local = localLeg(notionalUsd);
    const domestic = deskLeg(yenOf(notional, listing.currency));
    localUsd = local == null ? null : local * 2;
    domesticUsd = domestic == null ? null : dollars(domestic * 2, "JPY");
    commissionUsd = plus(localUsd, domesticUsd);
    const jpy = usdPer("JPY");
    fxUsd = notionalUsd == null || !(jpy > 0) ? null : notionalUsd * FX_YEN * 2 * jpy;
    commission = {
      local: { rate: US_LOCAL_RATE, min: US_LOCAL_MIN, currency: "USD" },
      domestic: { perOrder: domestic, min: DESK_MIN, currency: "JPY" },
      eachWay: true,
    };
  }
  const brokerFees = plus(commissionUsd, fxUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    japan ? "ordre internet, un seul ordre dans la journée" : "ordre passé en agence, pas en ligne",
    japan ? "ligne en yens : pas de change" : "compte en yens : 50 sen par sens dans le chiffre",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission,
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
      ...(american
        ? { local: finite(localUsd, 6), domestique: finite(domesticUsd, 6), change: finite(fxUsd, 6) }
        : {}),
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
          japan: "美らネット24 internet, per order a day, tax included: 110 / 330 / 550 / 660 JPY up to 200k / 500k / 1M / 1.5M, 990 above; Tokyo and Nagoya",
          usFee: "face to face only (onlineBuy false), per order: local 0.05 % min 5 USD, plus the face-to-face Japanese table on the yen amount (1.21638 % up to 500k ... 0.08536 % + 211105 above 100M), min 2750 JPY tax included",
          conversion: "in the number: 0.50 JPY per USD each way, cash is JPY only",
          rule606: "none: local broker not named; the book is the quoted NBBO",
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
    console.error("usage : node brokers/ando/ando_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.local != null) console.log(`    local        : ${parts.local} $`);
    if (parts.domestique != null) console.log(`    domestique   : ${parts.domestique} $`);
    if (parts.change != null) console.log(`  change         : ${parts.change} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
