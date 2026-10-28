// Cash round trip on the Stock Exchange of Hong Kong (SEHK, XHKG): buy n
// shares at price p, sell them straight back, in dollars. Shared by the
// brokers whose only place is HKEX (primehk, upbest, asa, publichk,
// bancowelllink and the others of the same kind); each broker file passes
// its own commission line and its own CCASS / settlement / handling line.
//
// Statutory charges, each side, on the consideration (read 2026-10-26):
//   SFC transaction levy   0.0027 %, rounded to the nearest cent
//   AFRC transaction levy  0.00015 % (from 1 Jan 2022), nearest cent
//   HKEX trading fee       0.00565 % (from 1 Jan 2023, when the 0.50 HKD
//                          trading tariff was abolished), nearest cent
//   Investor compensation levy: suspended since 19 Dec 2005.
//     "SFC Transaction Levy 0.0027% per side of consideration [...] rounded
//     to the nearest cent"
//     https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-(Hong-Kong)/Trading/Transaction
//   Stamp duty             0.1 % on the buy and on the sale (from 17 Nov
//                          2023), "rounded up to the nearest dollar", on the
//                          HKD value of the trade.
//     ETF (incl. leveraged and inverse products): no stamp (Stamp Duty
//     (Amendment) Ordinance 2015, from 13 Feb 2015).
//     REIT: no stamp on a transaction on or after 21 Dec 2024 (Stamp Duty
//     Legislation (Miscellaneous Amendments) Ordinance 2024, IRD Stamping
//     Circular No. 4/2024: "Transactions in REIT shares or units on or
//     after the Relevant Date are no longer subject to stamp duty").
//     https://ird.gov.hk/eng/pdf/sdo/ext_cir/SOExtCir_202404(e).pdf
//     A REIT row is type STOCK in the catalogue; its `raw` carries HKEX's
//     category "Real Estate Investment Trusts".
//   HKSCC charges the broker 0.0042 % a side (from 30 Jun 2025, no
//   minimum or maximum), but what the client pays is the broker's own
//   "CCASS settlement" / "handling" line, so it comes from the schedule
//   (`settlement`), not from here.
//     https://www.hkex.com.hk/-/media/HKEX-Market/Services/Rules-and-Forms-and-Fees/Rules/HKSCC/Rule-Update_Operational-Procedures/019_25_HKSCC-OP_Stock-settlement-fee-restructure_e.pdf
//   Italian FTT (0.2 %) on HK-listed Italian issuers is on the day's net
//   purchase, zero on a round trip.
//
// Left out: scrip / registration fee (a fee per board lot held over a book
// close, not a trade cost), custody, dividend collection, odd-lot book.
// The trade is priced on its notional; the board lot of the row is shown
// (HKEX lots are often worth more than the default size: a smaller size is
// an odd lot).
//
// Currency: HKD, USD and CNH counters. Commission, minimum and settlement
// fees are printed in HKD; on a USD or CNH counter they are charged in the
// equivalent (fx.mjs). Stamp is rounded up on the HKD value and converted
// back. A counter whose currency is not a deposit currency of the broker
// (`schedule.cash`) is a forced conversion: `schedule.fxEach` (one leg, a
// fraction) prices it in the total; null leaves the total unknown.
//
// schedule: {
//   broker, folder, catalogueUrl, url, readOn,
//   channel        French words for the order channel ("ordre en ligne (internet, appli)"),
//   commission     { rate, min } min in HKD, or { rate, min: { HKD, USD, CNH } } in each currency,
//   settlement     { rate, min = 0, max = Infinity, label } in HKD, each side, or null,
//   perOrder       fixed HKD per order (each side), default 0,
//   cash           deposit currencies kept unconverted, e.g. ["HKD", "USD", "CNH"],
//   fxEach         one-leg FX fraction for a forced conversion, or null (unknown),
//   fxLabel        French words on that FX (source), optional,
//   remark         English remark, optional,
//   onlineBuy      default true,
// }
//
// Use:
//   import { hkexRoundTrip, printCli } from "../primehk/hkexCost.mjs";
//   export function roundTrip(query) { return hkexRoundTrip(SCHEDULE, query); }
//   printCli(import.meta.url, roundTrip);
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";

export const HKEX = {
  sfc: 0.000027,
  afrc: 0.0000015,
  trading: 0.0000565,
  stamp: 0.001,
  hkscc: 0.000042,
  urls: {
    fees: "https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-(Hong-Kong)/Trading/Transaction",
    reitStamp: "https://ird.gov.hk/eng/pdf/sdo/ext_cir/SOExtCir_202404(e).pdf",
    hkscc: "https://www.hkex.com.hk/-/media/HKEX-Market/Services/Rules-and-Forms-and-Fees/Rules/HKSCC/Rule-Update_Operational-Procedures/019_25_HKSCC-OP_Stock-settlement-fee-restructure_e.pdf",
  },
};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const cents = (x) => Math.round(x * 100 + 1e-9) / 100;
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const convert = (amount, from, to) => {
  if (code(from) === code(to)) return amount;
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  return usd == null || !(per > 0) ? null : usd / per;
};
// fx.mjs folds CNH into CNY; the catalogue and the deposit list write CNH.
const cashKey = (ccy) => (listingCash(ccy) === "CNY" ? "CNH" : listingCash(ccy));

// French percent, "0,0027 %".
export function frPct(rate) {
  const v = Math.round(rate * 100 * 1e6) / 1e6;
  return `${String(v).replace(".", ",")} %`;
}

// "ETF", "REIT" or null: the reason a row pays no stamp.
export function stampFree(row) {
  if (code(row?.type) === "ETF" || code(row?.type) === "ETN") return "ETF";
  if (code(row?.type) === "REIT" || /Real Estate Investment Trust/i.test(String(row?.raw || ""))) return "REIT";
  return null;
}

// Statutory charges of one side, in the listing currency.
export function hkexSide(notional, currency, { free = null } = {}) {
  const sfc = cents(notional * HKEX.sfc);
  const afrc = cents(notional * HKEX.afrc);
  const trading = cents(notional * HKEX.trading);
  let stamp = 0;
  if (!free) {
    const hkd = convert(notional, currency, "HKD");
    if (hkd == null) return null;
    const stampHkd = Math.ceil(hkd * HKEX.stamp - 1e-9);
    const local = convert(stampHkd, "HKD", currency);
    if (local == null) return null;
    stamp = code(currency) === "HKD" ? stampHkd : cents(local);
  }
  return { sfc, afrc, trading, stamp, levies: sfc + afrc + trading };
}

// One side of a broker line printed in HKD ({ rate, min, max }), in the
// listing currency. `min` may be a map by currency.
function hkdLine(line, notional, currency) {
  if (!line) return 0;
  const ccy = cashKey(currency);
  let min = line.min ?? 0;
  let max = line.max ?? Infinity;
  if (min && typeof min === "object") {
    if (min[ccy] == null) return null;
    min = min[ccy];
  } else {
    min = convert(min, "HKD", currency);
    max = max === Infinity ? Infinity : convert(max, "HKD", currency);
    if (min == null || max == null) return null;
  }
  return cents(Math.min(max, Math.max(min, notional * (line.rate || 0))));
}

const loaded = new Map();
function loadRows(catalogueUrl) {
  const key = String(catalogueUrl);
  if (!loaded.has(key)) {
    let rows = null;
    if (fs.existsSync(catalogueUrl)) {
      const catalogue = JSON.parse(fs.readFileSync(catalogueUrl, "utf8"));
      rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
      if (rows.length) warmListingIndex(rows);
    }
    loaded.set(key, rows);
  }
  return loaded.get(key);
}

function findListing(rows, { etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency) === "CNY" ? "CNH" : code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function lineWords(line) {
  if (!line) return "";
  const min = line.min && typeof line.min === "object"
    ? Object.entries(line.min).map(([c, v]) => `${v} ${c}`).join(" / ")
    : line.min ? `${line.min} HKD` : "";
  const parts = [frPct(line.rate || 0)];
  if (min) parts.push(`plancher ${min}`);
  if (line.max != null && line.max !== Infinity) parts.push(`plafond ${line.max} HKD`);
  return parts.join(", ");
}

export function hkexRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const cash = new Set((schedule.cash || ["HKD"]).map(code));
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: schedule.onlineBuy ?? true,
    cashCurrency: "HKD",
    url: schedule.url,
    remark: schedule.remark || "",
  };
  const rows = loadRows(schedule.catalogueUrl);
  if (!rows) {
    return {
      ...answer,
      why: `le catalogue ${schedule.broker} n'existe pas encore : lancer \`node brokers/${schedule.folder}/${schedule.folder}_scraping.mjs\``,
    };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${schedule.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${schedule.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: schedule.folder,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const lot = Number.isInteger(m.row.lot) && m.row.lot > 0 ? m.row.lot : null;
  const free = stampFree(m.row);
  const ccyKey = cashKey(listing.currency);
  const converts = !cash.has(ccyKey);
  const fxEach = converts ? (schedule.fxEach ?? null) : 0;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const basis =
    `${schedule.channel || "ordre en ligne"}, barème ${schedule.broker} relu le ${schedule.readOn}. ` +
    `Courtage ${lineWords(schedule.commission)}` +
    (schedule.perOrder ? ` ; ${schedule.perOrder} HKD par ordre` : "") +
    (schedule.settlement ? ` ; ${schedule.settlement.label || "frais de règlement CCASS"} ${lineWords(schedule.settlement)}` : "") +
    ` ; prélèvement SFC ${frPct(HKEX.sfc)}, AFRC ${frPct(HKEX.afrc)}, frais de bourse HKEX ${frPct(HKEX.trading)}` +
    ` ; timbre ${frPct(HKEX.stamp)} arrondi au dollar HK supérieur (0 sur un ETF ou un REIT). Chaque sens.`;
  const shared = {
    ...answer,
    remark: [answer.remark, m.row.remark].filter(Boolean).join(" "),
    cashCurrency: converts ? "HKD" : ccyKey,
    listing,
    lot,
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: converts ? (fxEach == null ? null : fxEach * 2) : 0,
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  if (notionalUsd == null) return { ...shared, why: `aucun cours en dollars pour ${listing.currency} dans fx.mjs` };

  const commission = hkdLine(schedule.commission, notional, listing.currency);
  if (commission == null) {
    return { ...shared, why: `le barème ${schedule.broker} n'imprime pas de plancher de courtage en ${listing.currency}` };
  }
  const perOrder = schedule.perOrder ? convert(schedule.perOrder, "HKD", listing.currency) : 0;
  const settlement = hkdLine(schedule.settlement, notional, listing.currency);
  const side = hkexSide(notional, listing.currency, { free });
  if (perOrder == null || settlement == null || side == null) {
    return { ...shared, why: `pas de cours pour ramener ${listing.currency} en HKD` };
  }

  // brokerFees: commission and per-order fee. bourse: the broker's CCASS /
  // settlement line, SFC, AFRC and the HKEX trading fee (as in the other HK
  // files, where the settlement fee sits with the levies). taxes: stamp.
  const brokerLocal = Number(((commission + perOrder) * 2).toPrecision(12));
  const levyLocal = Number(((side.levies + settlement) * 2).toPrecision(12));
  const stampLocal = Number((side.stamp * 2).toPrecision(12));
  const brokerFees = dollars(brokerLocal, listing.currency);
  const levyUsd = dollars(levyLocal, listing.currency);
  const stampUsd = dollars(stampLocal, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd = parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const fxUsd = fxEach == null ? null : notionalUsd * fxEach * 2;
  const usd = plus(bookUsd, brokerFees, levyUsd, stampUsd, fxUsd);

  const why = [
    converts && fxEach == null
      ? `${ccyKey} n'est pas une devise de dépôt : change au cours maison, que ${schedule.broker} ne publie pas, total inconnu`
      : null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean).join(" ; ");
  const minHit = schedule.commission && notional * schedule.commission.rate < commission - 1e-9;
  const confidence = [
    basis,
    minHit ? `courtage au plancher (${cents(commission)} ${listing.currency} par sens)` : `courtage ${cents(commission)} ${listing.currency} par sens`,
    free ? `pas de timbre : ${free}` : `timbre ${cents(side.stamp)} ${listing.currency} par sens`,
    lot ? `lot de bourse ${lot} (${Number((n / lot).toPrecision(4))} lot${n / lot >= 2 ? "s" : ""})` : "pas de lot de bourse dans le catalogue",
    "taxe italienne sur la position nette du jour : nulle sur un aller-retour",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} ${listing.currency} par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    converts
      ? fxEach == null
        ? `change forcé ${listing.currency} → HKD au cours maison non publié`
        : `change forcé ${frPct(fxEach)} par sens${schedule.fxLabel ? ` (${schedule.fxLabel})` : ""}`
      : `caisse en ${ccyKey}, pas de change`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: cents(commission + perOrder),
      sell: cents(commission + perOrder),
      brokerage: cents(commission),
      perOrder: cents(perOrder),
      currency: listing.currency,
      eachWay: true,
    },
    levy: { settlement: cents(settlement), sfc: side.sfc, afrc: side.afrc, trading: side.trading, stamp: side.stamp, perSide: true, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: finite(levyUsd, 6),
      taxes: finite(stampUsd, 6),
      change: fxUsd == null ? null : finite(fxUsd, 6),
    },
    confidence,
  };
}

export function printCli(callerUrl, roundTrip) {
  let called = false;
  try {
    called = callerUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/<folder>/<folder>_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=id]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
    plan: arg("plan", null),
  }), null, 2));
}
