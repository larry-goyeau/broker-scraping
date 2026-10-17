// What one round trip costs at Monex Securities: buy n shares at price p,
// sell them back at once, in dollars. Internet orders on the per-order
// course. The daily flat, the phone line, the IFA schedule and NISA stay
// out. The named-US-ETF buy waiver is a subset and stays out. Odd-lot
// orders stay out.
//
// Re-read 2026-10-17.
//
//   Japan, per order, tax included
//     up to 50 000 ¥                 55 ¥
//     up to 100 000 ¥                99 ¥
//     up to 200 000 ¥               115 ¥
//     up to 500 000 ¥               275 ¥
//     up to 1 000 000 ¥             535 ¥
//     up to 1 500 000 ¥             640 ¥
//     up to 30 000 000 ¥          1 013 ¥
//     above                         1 070 ¥
//   United States, one order, tax included
//     0.495 %
//     minimum 0
//     capped at 22 USD
//     a sale also pays the SEC fee, 0.0000206 of the dollar notional,
//     rounded up to the third decimal, at least 0.01 USD
//     (orders from 2026-04-06)
//   Hong Kong, one order, tax included
//     0.25 % rounded up to the cent, then 10 % tax truncated to the cent
//     floor 49.5 HKD, cap 495 HKD, both tax included
//     the local broker commission is borne by Monex
//     Monex names the place charges and leaves the cells empty. The
//     rates are HKEX's, each side:
//       stamp 0.1 %, up to the next dollar, on a share or a REIT.
//       An ETF pays none (Stamp Duty Ordinance, from 2015-02-13).
//       SFC levy 0.0027 %, nearest cent
//       AFRC levy 0.00015 %, nearest cent
//       trading fee 0.00565 %, nearest cent
//       CCASS stock settlement 0.0042 %, nearest cent, no floor or cap
//         since 2025-06-30
//       the investor-compensation levy has been suspended since 2005-12-19
//
// Dollars convert at 0 sen on the buy and 25 sen on the sale. Hong Kong
// dollars convert at 15 sen each way. Both sit inside the rate. That
// charge is the remark, not this ticket. Yen settlement of a US order is
// the same 25 sen and stays out the same way.
//
// US orders go to TradeStation Securities, Inc. That firm files a Rule
// 606, so a US line uses that mix.
//
//   https://info.monex.co.jp/stock/fee.html
//   https://info.monex.co.jp/us-stock/fee.html
//   https://info.monex.co.jp/china-stock/fee.html
//   https://info.monex.co.jp/us-stock/guide/rule.html
//   https://faq.monex.co.jp/faq/show/662?site_domain=default
//   https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-(Hong-Kong)/Trading/Transaction?sc_lang=en
//   https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/HKSCC/2025/ce_HKSCC_SET_022_2025.pdf
//   https://www.ird.gov.hk/eng/faq/ETFs.htm
//
//   node brokers/monex/monex_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000
//   node brokers/monex/monex_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/monex/monex_cost.mjs 700 "Hong Kong" HKD --shares=100 --price=400
//   node brokers/monex/monex_cost.mjs --schedule
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

const CATALOGUE = new URL("monex-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://info.monex.co.jp/stock/fee.html",
  us: "https://info.monex.co.jp/us-stock/fee.html",
  china: "https://info.monex.co.jp/china-stock/fee.html",
  rules: "https://info.monex.co.jp/us-stock/guide/rule.html",
  hkex: "https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-(Hong-Kong)/Trading/Transaction?sc_lang=en",
  ccass: "https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/HKSCC/2025/ce_HKSCC_SET_022_2025.pdf",
  readOn: "2026-10-17",
  secOn: "2026-04-06",
  entity: "マネックス証券",
  venue: "TradeStation Securities, Inc.",
};

const US_RATE = 0.00495;
const US_CAP = 22;
const SEC_RATE = 0.0000206;
const HK_PRETAX = 0.0025;
const HK_VAT = 0.1;
const HK_MIN = 49.5;
const HK_CAP = 495;
const HK_STAMP = 0.001;
const HK_SFC = 0.000027;
const HK_AFRC = 0.0000015;
const HK_TRADING = 0.0000565;
const HK_CCASS = 0.000042;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const JAPAN = new Set(["TOKYO", "NAGOYA", "FUKUOKA", "SAPPORO"]);

// Tax-included yen, one cash order, on the notional of that order.
const JAPAN_STEPS = [
  [50_000, 55],
  [100_000, 99],
  [200_000, 115],
  [500_000, 275],
  [1_000_000, 535],
  [1_500_000, 640],
  [30_000_000, 1013],
  [Infinity, 1070],
];

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

function japanLeg(notional) {
  if (!(notional > 0)) return null;
  for (const [cap, fee] of JAPAN_STEPS) if (notional <= cap) return fee;
  return JAPAN_STEPS.at(-1)[1];
}

function usLeg(notional) {
  if (!(notional > 0)) return null;
  return Math.min(notional * US_RATE, US_CAP);
}

// 0.0000206 per dollar, up to the third decimal, and at least one cent.
function secFee(notional) {
  if (!(notional > 0)) return 0;
  const rounded = Math.ceil(notional * SEC_RATE * 1000 - 1e-9) / 1000;
  return Math.max(rounded, 0.01);
}

// 0.25 % rounded up to the cent, then 10 % tax truncated to the cent.
function hkLeg(notionalHkd) {
  if (!(notionalHkd > 0)) return null;
  const base = Math.ceil(notionalHkd * HK_PRETAX * 100 - 1e-9) / 100;
  const vat = Math.floor(base * HK_VAT * 100 + 1e-9) / 100;
  return Math.min(HK_CAP, Math.max(HK_MIN, base + vat));
}

// Half up to the cent: the third decimal of 5 or more goes up.
function nearestCent(amount) {
  return Math.round(amount * 100 + 1e-9) / 100;
}

// HKEX, one side. Stamp is waived on an ETF. The compensation levy is 0.
function hkPlace(notionalHkd, type) {
  if (!(notionalHkd > 0)) return null;
  const stamp = type === "ETF" || type === "ETN" ? 0 : Math.ceil(notionalHkd * HK_STAMP - 1e-9);
  return (
    stamp +
    nearestCent(notionalHkd * HK_SFC) +
    nearestCent(notionalHkd * HK_AFRC) +
    nearestCent(notionalHkd * HK_TRADING) +
    nearestCent(notionalHkd * HK_CCASS)
  );
}

function fxRemarkOf(market) {
  if (US_MICS.has(market) || market === "TEXASSE") {
    return "FX 0.25 JPY per USD on the sale when cash ≠ USD.";
  }
  if (market === "HONGKONG") return "FX 0.15 JPY per HKD each way when cash ≠ HKD.";
  return "";
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
    return { ...answer, why: "le catalogue Monex n'existe pas encore : lancer `node brokers/monex/monex_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Monex` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Monex`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "monex",
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
  const american = listing.currency === "USD" && (US_MICS.has(listing.mic) || US_MICS.has(market) || market === "TEXASSE");
  const hongKong = market === "HONGKONG";
  if (!japan && !american && !hongKong) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const remark = japan ? "" : fxRemarkOf(market);
  const shared = {
    ...answer,
    listing,
    cashCurrency: japan ? "JPY" : american ? "USD" : "HKD",
    remark,
    url: japan ? SCHEDULE.url : american ? SCHEDULE.us : SCHEDULE.china,
    basis: japan
      ? `cours par ordre Monex, relu le ${SCHEDULE.readOn} : 55 ¥ jusqu'à 50 000 ¥, un montant par ordre`
      : american
        ? `barème US Monex, relu le ${SCHEDULE.readOn} : 0,495 % TTC par ordre, plafond 22 USD ; SEC ${SEC_RATE} à la vente (${SCHEDULE.secOn})`
        : `barème Hong Kong Monex, relu le ${SCHEDULE.readOn} : 0,275 % TTC par ordre, min 49,5 HKD, plafond 495 HKD ; HKEX timbre 0,1 % hors ETF, SFC 0,0027 %, AFRC 0,00015 %, bourse 0,00565 %, CCASS 0,0042 %`,
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
  if (american) {
    const quoted = usBookPerShare({
      broker: "tradestation",
      ticker: listing.ticker,
      fallback: marketPerShare,
    });
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

  let commissionUsd = null;
  let commission = { currency: "JPY", eachWay: true };
  let secUsd = 0;
  let placeUsd = 0;
  if (japan) {
    const one = japanLeg(notional);
    commissionUsd = one == null ? null : dollars(one * 2, "JPY");
    commission = { steps: "55–1070 JPY", currency: "JPY", eachWay: true };
  } else if (american) {
    const buy = usLeg(notional);
    const sell = usLeg(notional);
    commissionUsd = plus(buy, sell);
    secUsd = secFee(notional);
    commission = { rate: US_RATE, cap: US_CAP, currency: "USD", eachWay: true };
  } else {
    const hkd = inCurrency(notional, listing.currency, "HKD");
    const one = hkLeg(hkd);
    const both = one == null ? null : one * 2;
    commissionUsd = both == null ? null : dollars(both, "HKD");
    const place = hkPlace(hkd, listing.type);
    placeUsd = place == null ? null : dollars(place * 2, "HKD");
    commission = { rate: 0.00275, min: HK_MIN, cap: HK_CAP, currency: "HKD", eachWay: true };
  }
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : plus(notionalUsd * taxTotal, secUsd, placeUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    japan
      ? "cours par ordre, pas le forfait du jour, pas NISA"
      : american
        ? `exécution ${SCHEDULE.venue}`
        : "commission locale prise en charge par Monex ; timbre et frais de place au barème HKEX",
    remark ? "change hors du chiffre" : "ligne en yens : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet 605 × Q TradeStation, ${marketPerShare} $ la part`
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
          japan: "55 JPY up to 50000, then 99 / 115 / 275 / 535 / 640 / 1013, 1070 above 30000000, tax included, per order",
          us: "0.495 % tax included per order, minimum 0, cap 22 USD; SEC 0.0000206 on the sale from 2026-04-06",
          hongKong:
            "0.25 % rounded up to the cent plus 10 % tax truncated, floor 49.5 HKD, cap 495 HKD, per order; HKEX each side: stamp 0.1 % up to the dollar except an ETF, SFC 0.0027 %, AFRC 0.00015 %, trading fee 0.00565 %, CCASS 0.0042 %",
          conversion: "USD 0 on the buy and 0.25 JPY on the sale; HKD 0.15 JPY each way; both stay out of the ticket",
          rule606: "tradestation",
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
    console.error("usage : node brokers/monex/monex_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
