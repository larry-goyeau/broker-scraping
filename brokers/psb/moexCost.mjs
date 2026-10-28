// Shared round-trip engine for the second batch of Moscow Exchange brokers
// (catalogue = the MOEX equity listing from ../sber/moexBook.mjs): psb, mts,
// kitfinance, d8, russ, levoberezhny, primorye, aktiv, chelinvest, rossiya,
// bbr, severgazbank, dominvest, saintpetersburg, russianstandard,
// metallinvestbank, investitsionnaya, ivolga.
//
// It is ../sber/moexCost.mjs (same contract, same constants, same exchange
// tariffs, re-exported from there) with three additions:
//   1. `deposits` (cfg or plan): the deposit currencies used while
//      deposits.mjs has no entry for the folder yet. Once the main session
//      wires deposits.mjs, that entry wins.
//   2. A side fee of `null` (buyRub / sellRub) means unknown: the total is
//      then N/A (unknown + x = unknown), never 0.
//   3. `onlineBuy` (cfg or plan, default true) and an optional per-plan
//      `cash` override are passed through.
//
// Moscow Exchange stock-market tariff in force since 01.11.2022,
// https://www.moex.com/s1166 re-read on 2026-10-26: T+ book, shares,
// depositary receipts, exchange-fund units and foreign ETFs alike, taker
// 0.01725% (exchange) + 0.01275% (NCC clearing) = 0.03%, at least
// 0.01 + 0.01 = 0.02 RUB a trade; maker 0. No separate rate for yuan
// settlement. A round trip that crosses the book is a taker both ways:
// `moexLeviesRub(notionalRub)` = 2 x max(0.03% x amount, 0.02 RUB).
// Currency market (forced RUB->CNY conversion), see ../sber/moexCost.mjs.
//
// Russia has no stamp duty or transaction tax on exchange trades (taxMap
// has nothing for RU ISINs); the taxMap sum is still added.
//
//   import { makeRoundTrip, cli, moexLeviesRub, bandRate, MOEX_BASIS } from "../psb/moexCost.mjs";
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";
import {
  MOEX_PAGE,
  MOEX_FX_PAGE,
  MOEX_TAKER,
  MOEX_MIN_RUB,
  MOEX_BASIS,
  dollars,
  joinRemarks,
  pct,
  rubPer,
  bandRate,
  moexLevyRub,
  moexFxLevyRub,
  cli,
} from "../sber/moexCost.mjs";

export {
  MOEX_PAGE,
  MOEX_FX_PAGE,
  MOEX_TAKER,
  MOEX_MIN_RUB,
  MOEX_BASIS,
  dollars,
  joinRemarks,
  pct,
  rubPer,
  bandRate,
  moexLevyRub,
  moexFxLevyRub,
  cli,
};

/** Moscow Exchange fee on a round trip (taker both ways), rubles. */
export function moexLeviesRub(notionalRub) {
  return 2 * moexLevyRub(notionalRub);
}

/** "0,03 %" style label for French basis strings. */
export const pctFr = (r) => `${String(Number((r * 100).toFixed(4))).replace(".", ",")} %`;

/** Fees(ctx) for a flat % per side, optional floor per order (rubles), exchange on top or included. */
export function flatFees({ rate, minRub = 0, levies = true, basis, remark = "", confidence = null }) {
  return ({ notionalRub }) => {
    const side = Math.max(notionalRub * rate, minRub);
    return {
      rate,
      buyRub: side,
      sellRub: side,
      levyRub: levies ? moexLeviesRub(notionalRub) : 0,
      basis: levies ? `${basis} ; ${MOEX_BASIS}.` : basis,
      ...(remark ? { remark } : {}),
      ...(confidence ? { confidence } : {}),
    };
  };
}

/** Fees(ctx) for day-turnover bands (the band reached by 2 x amount prices both legs). */
export function bandFees({ bands, minRub = 0, levies = true, basis, remark = "", confidence = null }) {
  return ({ notionalRub, turnoverRub }) => {
    const rate = bandRate(bands, turnoverRub);
    const side = Math.max(notionalRub * rate, minRub);
    return {
      rate,
      buyRub: side,
      sellRub: side,
      levyRub: levies ? moexLeviesRub(notionalRub) : 0,
      basis:
        `${basis} ; le chiffre d'un aller-retour du jour (deux fois le montant) fixe le palier` +
        (levies ? ` ; ${MOEX_BASIS}.` : "."),
      ...(remark ? { remark } : {}),
      ...(confidence ? { confidence } : {}),
    };
  };
}

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const OTHER = ["USD", "EUR", "CNY", "BYN", "TRY", "KZT", "AED", "HKD", "AMD"];

function findListing(rows, { etf, place, currency }) {
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
 * cfg = {
 *   folder, brand, catalogue (URL), page, readOn, sources?, onlineBuy?,
 *   deposits?: ["RUB", ...]   (used only while deposits.mjs has no entry),
 *   plans: { id: { id, name, remark, fx (remark rate 0..1 | null), fxExtra, sheet,
 *                  deposits?, onlineBuy?,
 *                  convert: { rate, min, basis } | null   (forced RUB->CCY conversion, each way),
 *                  fees(ctx) } },
 *   defaultPlan,
 * }
 * fees(ctx) gets { plan, row, listing, etf, ccy, n, notional, notionalRub, turnoverRub, rubPerUnit }
 * and returns { rate, buyRub, sellRub (null = unknown), levyRub (null = unknown), basis, remark?, confidence?, detail? }.
 */
export function makeRoundTrip(cfg) {
  const catalogue = fs.existsSync(cfg.catalogue) ? JSON.parse(fs.readFileSync(cfg.catalogue, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);
  const wired = ["RUB", ...OTHER].some((c) => depositHas(cfg.folder, null, c));

  return function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
    const chosen = cfg.plans[String(plan || cfg.defaultPlan)] || cfg.plans[cfg.defaultPlan];
    const fallback = (chosen.deposits || cfg.deposits || ["RUB"]).map(code);
    const holds = (c) => (wired ? depositHas(cfg.folder, chosen.id, c) : fallback.includes(code(c)));
    const many = OTHER.some(holds);
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy: chosen.onlineBuy ?? cfg.onlineBuy ?? true,
      cashCurrency: "RUB",
      url: cfg.page,
      remark: chosen.remark || "",
      plan: chosen.id,
    };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${cfg.brand} n'existe pas encore : lancer \`node brokers/${cfg.folder}/${cfg.folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing(rows, { etf, place, currency });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${cfg.brand}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${cfg.brand}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
      };
    }

    const m = matches[0];
    const book = spreadLeaf(spreads, {
      isin: m.row.isin,
      mic: m.venue?.mic ?? null,
      currency: m.row.currency,
      unsourced: m.unsourced,
      broker: cfg.folder,
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
    const ccy = listing.currency;
    const held = holds(ccy);
    const convert = held ? null : chosen.convert || null;
    const marketBp = bp ?? book.leaf?.bp ?? null;
    const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
    const fxNote = many && chosen.fx != null ? fxRemark(100 * chosen.fx, ccy, chosen.fxExtra || "") : "";
    const shared = {
      ...answer,
      cashCurrency: held ? ccy : "RUB",
      listing,
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(ccy) },
      fxIfConverted: convert ? convert.rate * 2 : 0,
      bp: marketBp,
      perShare: marketPerShare,
    };
    if (listing.mic !== "MISX") return { ...shared, why: `${listing.exchange} n'est pas une place tarifée chez ${cfg.brand}` };
    if (!held && !convert) {
      return { ...shared, remark: joinRemarks(m.row.remark, chosen.remark), why: `${ccy} n'est pas une devise de dépôt ${cfg.brand} et aucun change publié` };
    }

    const n = Number(shares);
    const p = Number(price);
    const rpu = rubPer(ccy);
    const base = { ...shared, remark: [joinRemarks(m.row.remark, chosen.remark), fxNote].filter(Boolean).join("\n") };
    if (!(n > 0)) return { ...base, why: "aucun nombre de parts" };
    if (!(p > 0)) return { ...base, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
    if (rpu == null) return { ...base, why: `aucun cours en roubles pour ${ccy} dans fx.mjs` };

    const notional = n * p;
    const notionalRub = notional * rpu;
    const notionalUsd = dollars(notional, ccy);
    const fee = chosen.fees({
      plan: chosen,
      row: m.row,
      listing,
      etf: listing.type === "ETF",
      ccy,
      n,
      notional,
      notionalRub,
      // Buy and sell on the same day: the day's turnover is twice the amount.
      turnoverRub: notionalRub * 2,
      rubPerUnit: rpu,
    });
    const brokerRub = plus(fee.buyRub, fee.sellRub);
    const fxRub = convert
      ? 2 * (Math.max(notionalRub * convert.rate, convert.min || 0) + moexFxLevyRub(notional, rpu))
      : 0;
    const brokerFees = brokerRub == null ? null : dollars(brokerRub + fxRub, "RUB");
    const levies = fee.levyRub == null ? null : dollars(fee.levyRub, "RUB");
    const taxPct = Object.values(taxRates(taxesOf(listing.isin))).reduce((sum, r) => sum + r, 0);
    const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
    const parts = bookParts({
      bp: marketBp,
      perShare: marketPerShare,
      venue: m.venue,
      unsourced: m.unsourced,
      toUsd: (amount) => dollars(amount, ccy),
    });
    const bookUsd =
      parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
    const usd = plus(bookUsd, brokerFees, levies, taxUsd);
    const why =
      usd != null
        ? null
        : notionalUsd == null
          ? `aucun cours en dollars pour ${ccy} dans fx.mjs`
          : brokerFees == null
            ? `courtage ${cfg.brand} inconnu pour cette ligne`
            : bookUsd == null
              ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
              : `frais de ${listing.exchange} non relus`;

    return {
      ...base,
      remark: [joinRemarks(m.row.remark, chosen.remark, fee.remark), fxNote].filter(Boolean).join("\n"),
      basis:
        `tarifs ${cfg.brand} relus le ${cfg.readOn}, ${fee.basis}` +
        (convert ? ` Change forcé (compte en roubles seulement) : ${convert.basis}, plus le tarif du marché des changes de la Bourse de Moscou, chaque sens.` : ""),
      ...(fee.confidence ? { confidence: fee.confidence } : {}),
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      ...(why ? { why } : {}),
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), notionalRub: finite(notionalRub, 6), currency: ccy },
      commission: { plan: chosen.name, rate: fee.rate, dayTurnoverRub: finite(notionalRub * 2, 6), buy: fee.buyRub, sell: fee.sellRub, currency: "RUB", ...(fee.detail || {}) },
      parts: {
        marché: finite(bookUsd, 6),
        courtage: brokerRub == null ? null : finite(dollars(brokerRub, "RUB"), 6),
        change: finite(dollars(fxRub, "RUB"), 6),
        taxes: finite(plus(levies, taxUsd), 6),
        courtageRub: finite(brokerRub, 6),
        changeRub: finite(fxRub, 6),
        fraisBourseRub: finite(fee.levyRub, 6),
      },
      sources: { fees: chosen.sheet || cfg.page, plans: cfg.page, moex: MOEX_PAGE, ...(convert ? { moexFx: MOEX_FX_PAGE } : {}), ...(cfg.sources || {}) },
    };
  };
}
