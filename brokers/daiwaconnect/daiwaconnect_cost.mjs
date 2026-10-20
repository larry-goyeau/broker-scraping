// What one round trip costs at Daiwa Connect Securities: buy n shares at
// price p, sell them back at once, in dollars. App orders, cash, board lots.
// The monthly fee-free coupons (10 at opening, 3 a month) are a finite
// count, and prior use is unknown, so the ticket is the one without a
// coupon. ひな株 (odd lots at real-time price), margin and NISA stay out.
//
// Read 2026-10-18.
//
//   Japan, cash, board lot, one order, tax included
//     up to 180 000 ¥              99 ¥
//     above, below 1 200 000 ¥     0.055 % of the amount
//     1 200 000 ¥ and above        660 ¥
//     Tokyo is the only market served.
//   United States, ひな株USA
//     The customer trades with the firm, in yen only (国内店頭取引). There is
//     no commission. The price of the day is a base taken from the NYSE or
//     NASDAQ close or the after-market, plus the spread on a buy and minus
//     it on a sale: normally 0.7 % (2.5 % at most). The rate is a base rate
//     plus or minus 30 sen per dollar (100 sen at most). Both are set in the
//     morning and held all day, 9:00 to 17:00 Tokyo time.
//
// As at PayPay, the exchange bid-ask is not this trip: the price is the
// firm's own quote, so a US line has no book, and the spread and the yen
// rate are the ticket. The trip uses the normal 0.7 % and 30 sen each way;
// the maximums are the remark. Cash is yen only (deposits), so the 30 sen
// are in the number. No SEC fee, no stamp. Custody is not a ticket.
//
//   https://www.connect-sec.co.jp/service/stock/
//   https://www.connect-sec.co.jp/service/coupon/
//   https://www.connect-sec.co.jp/service/hinakabu_usa/
//   https://www.connect-sec.co.jp/service/hinakabu_usa/rule.html
//
//   node brokers/daiwaconnect/daiwaconnect_cost.mjs 1301 Tokyo JPY --shares=100 --price=4000
//   node brokers/daiwaconnect/daiwaconnect_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/daiwaconnect/daiwaconnect_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("daiwaconnect-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.connect-sec.co.jp/service/stock/",
  coupon: "https://www.connect-sec.co.jp/service/coupon/",
  us: "https://www.connect-sec.co.jp/service/hinakabu_usa/",
  rules: "https://www.connect-sec.co.jp/service/hinakabu_usa/rule.html",
  readOn: "2026-10-18",
  entity: "大和コネクト証券",
};

const JP_FLAT_UPTO = 180_000;
const JP_FLAT = 99;
const JP_RATE = 0.00055;
const JP_CAP_FROM = 1_200_000;
const JP_CAP = 660;
// ひな株USA, each side.
const US_SPREAD = 0.007;
const US_SPREAD_MAX = 0.025;
const FX_YEN = 0.3;
const FX_YEN_MAX = 1;
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
  if (notional <= JP_FLAT_UPTO) return JP_FLAT;
  if (notional >= JP_CAP_FROM) return JP_CAP;
  return Math.floor(notional * JP_RATE);
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
 * line, the firm's price spread and the yen rate spread.
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
    return {
      ...answer,
      why: "le catalogue Daiwa Connect n'existe pas encore : lancer `node brokers/daiwaconnect/daiwaconnect_scraping.mjs`",
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Daiwa Connect` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Daiwa Connect`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "daiwaconnect",
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
    remark: american
      ? `Normal price spread 0.7% each way, up to 2.5%; ${fxRemark((FX_YEN * usdPer("JPY") * 100).toFixed(3), "USD").replace(/\.$/, "")}, up to ${FX_YEN_MAX * 100} sen.`
      : "",
    url: japan ? SCHEDULE.url : SCHEDULE.rules,
    basis: japan
      ? `barème Daiwa Connect, lu le ${SCHEDULE.readOn} : 99 ¥ jusqu'à 180 000 ¥, 0,055 % TTC ensuite, 660 ¥ dès 1 200 000 ¥, par ordre, sans coupon`
      : `ひな株USA Daiwa Connect, lu le ${SCHEDULE.readOn} : gré à gré en yens, écart 0,7 % par sens sur le prix de base, plus 30 sen par dollar par sens`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    ...(american ? { bp: 0, perShare: 0 } : {}),
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const trade = {
    shares: n,
    price: p,
    notional,
    notionalUsd: finite(notionalUsd, 6),
    currency: listing.currency,
  };

  if (american) {
    // The firm's quote, not the exchange book: the spread is the ticket.
    const jpy = usdPer("JPY");
    const spreadUsd = notionalUsd == null ? null : notionalUsd * US_SPREAD * 2;
    const fxUsd = notionalUsd == null || !(jpy > 0) ? null : notionalUsd * FX_YEN * 2 * jpy;
    const brokerFees = plus(spreadUsd, fxUsd);
    const usd = plus(brokerFees, taxUsd);
    return {
      ...shared,
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      commission: { rate: 0, currency: "JPY", eachWay: true },
      buy: { spread: US_SPREAD, fxYen: FX_YEN },
      sell: { spread: US_SPREAD, fxYen: FX_YEN },
      trade,
      parts: {
        marché: 0,
        courtage: finite(spreadUsd, 6),
        change: finite(fxUsd, 6),
        taxes: finite(taxUsd, 6),
      },
      confidence: [
        shared.basis,
        "prix de contrepartie fixé le matin : carnet de la bourse non ajouté",
        `écart normal, pas le maximum (${US_SPREAD_MAX * 100} %, ${FX_YEN_MAX * 100} sen)`,
        "compte en yens : change dans le chiffre",
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
  const one = japanLeg(notional);
  const commissionUsd = one == null ? null : dollars(one * 2, "JPY");
  const brokerFees = commissionUsd;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    "sans coupon de gratuité",
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
    trade,
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
          japan: "per order, tax included: 99 JPY up to 180000, 0.055 % below 1200000, 660 JPY from 1200000; coupons left out",
          usFee: "ひな株USA, OTC in yen: 0.7 % a side on the base price (max 2.5 %), plus 0.30 JPY per USD a side (max 1.00); no commission",
          conversion: "in the number: cash is JPY only",
          rule606: "none: the firm is the counterparty",
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
    console.error("usage : node brokers/daiwaconnect/daiwaconnect_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
