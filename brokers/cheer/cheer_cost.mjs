// What one round trip costs at CHEER Securities: buy n shares at price p,
// sell them back at once, in dollars. App orders. Japanese shares on the
// 委託取引 line (the order goes to the Tokyo Stock Exchange); the 店頭取引
// line for Japanese shares (amount-based, 0.5 % on the Tokyo quote) is the
// other choice and stays out. NISA stays out.
//
// Read 2026-10-18.
//
//   Japan, 委託取引, one order, tax included
//     up to 100 000 ¥                55 ¥
//     up to 200 000 ¥               110 ¥
//     up to 500 000 ¥               275 ¥
//     up to 1 000 000 ¥             535 ¥
//     up to 1 500 000 ¥             640 ¥
//     up to 30 000 000 ¥          1 013 ¥
//     above                       1 070 ¥
//     Orders in one name, one account, one side, filled the same day, are
//     one order (一口注文). A buy and its sale are two.
//   United States, 国内店頭取引, in yen
//     The customer trades with the firm. No commission. The price is a
//     base plus the spread on a buy and minus it on a sale. During the New
//     York session the base is the best quote, the ask for a buy and the
//     bid for a sale, and the spread is 0.5 % of it. Outside the session it
//     is 0.7 %. The rate is the interbank rate plus or minus 0.20 ¥ per
//     dollar.
//
// Because the base is the best ask on a buy and the best bid on a sale, a
// US trip crosses the quoted NBBO and then pays 0.5 % each way. The firm is
// the counterparty and files no Rule 606, so the book is the quoted NBBO.
// The trip uses session hours; 0.7 % off the session is the remark. Cash is
// yen only (deposits), so the 0.20 ¥ each way is in the number. No SEC fee,
// no stamp. Custody and transfers out are not a ticket.
//
//   https://www.cheer-sec.co.jp/service/jp-stock.html
//   https://www.cheer-sec.co.jp/rule/commission.html
//   https://secure.okbiz.jp/cheer-sec/faq/show/233?site_domain=default
//   https://www.cheer-sec.co.jp/service/us-stock.html
//
//   node brokers/cheer/cheer_cost.mjs 1301 Tokyo JPY --shares=100 --price=4000
//   node brokers/cheer/cheer_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/cheer/cheer_cost.mjs --schedule
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

const CATALOGUE = new URL("cheer-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.cheer-sec.co.jp/service/jp-stock.html",
  commission: "https://www.cheer-sec.co.jp/rule/commission.html",
  oneOrder: "https://secure.okbiz.jp/cheer-sec/faq/show/233?site_domain=default",
  us: "https://www.cheer-sec.co.jp/service/us-stock.html",
  readOn: "2026-10-18",
  entity: "CHEER証券",
};

// [upper bound in yen, fee in yen], tax included.
const JP_STEPS = [
  [100_000, 55],
  [200_000, 110],
  [500_000, 275],
  [1_000_000, 535],
  [1_500_000, 640],
  [30_000_000, 1_013],
  [Infinity, 1_070],
];
// US, each side.
const US_SPREAD = 0.005;
const US_SPREAD_OFF = 0.007;
const FX_YEN = 0.2;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const JAPAN = new Set(["TOKYO"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function japanLeg(notional) {
  if (!(notional > 0)) return null;
  for (const [upTo, fee] of JP_STEPS) if (notional <= upTo) return fee;
  return null;
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
 * `usd` is the number the page prints. `brokerFees` is the ticket: on a US
 * line, the firm's 0.5 % and the yen rate spread.
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
    return { ...answer, why: "le catalogue CHEER n'existe pas encore : lancer `node brokers/cheer/cheer_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue CHEER` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez CHEER`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "cheer",
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
    remark: american ? `Outside New York hours the spread is ${Number(((US_SPREAD_OFF - US_SPREAD) * 100).toFixed(2))}% more.` : "",
    url: japan ? SCHEDULE.url : SCHEDULE.us,
    basis: japan
      ? `委託取引 CHEER, lu le ${SCHEDULE.readOn} : 55 ¥ jusqu'à 100 000 ¥ ... 1 070 ¥ au-delà de 30 000 000 ¥, TTC par ordre`
      : `店頭取引 US CHEER, lu le ${SCHEDULE.readOn} : meilleure limite + 0,5 % par sens en séance, plus 0,20 ¥ par dollar par sens`,
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
    // No 606: the quoted NBBO of the name.
    const quoted = usBookPerShare({ broker: "cheer", ticker: listing.ticker, fallback: marketPerShare });
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
  if (japan) {
    const one = japanLeg(notional);
    commissionUsd = one == null ? null : dollars(one * 2, "JPY");
    commission = { perOrder: one, currency: "JPY", eachWay: true };
  } else {
    const jpy = usdPer("JPY");
    commissionUsd = notionalUsd == null ? null : notionalUsd * US_SPREAD * 2;
    fxUsd = notionalUsd == null || !(jpy > 0) ? null : notionalUsd * FX_YEN * 2 * jpy;
    commission = { spread: US_SPREAD, offHours: US_SPREAD_OFF, fxYen: FX_YEN, currency: "JPY", eachWay: true };
  }
  const brokerFees = plus(commissionUsd, fxUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    japan ? "委託取引, pas le 店頭取引" : "contrepartie CHEER sur la meilleure limite, en séance",
    japan ? "ligne en yens : pas de change" : "compte en yens : change dans le chiffre",
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
      ...(american ? { change: finite(fxUsd, 6) } : {}),
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
          japan: "委託取引 per order, tax included: 55 / 110 / 275 / 535 / 640 / 1013 JPY up to 100k / 200k / 500k / 1M / 1.5M / 30M, 1070 above",
          usFee: "OTC in yen: best ask (buy) or bid (sale) plus or minus 0.5 % in the NY session, 0.7 % outside; 0.20 JPY per USD a side",
          conversion: "in the number: cash is JPY only",
          rule606: "none: the firm is the counterparty; the book is the quoted NBBO",
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
    console.error("usage : node brokers/cheer/cheer_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
