// Shared round-trip engine for the brokers whose catalogue is the Moscow
// Exchange equity listing (moexBook.mjs): sber, vtb, sovcombank, avangard,
// trinfico, gazprombank, bcs and finam. Each broker's `<folder>_cost.mjs`
// gives its own fee table (a `fees` function per plan) and this file does
// the rest the way tinvest_cost.mjs and alor_cost.mjs do: catalogue
// lookup, the venue's book, deposit currencies, a forced conversion when
// the listing currency cannot be held, and the answer in dollars.
//
// Moscow Exchange equity tariff in force since 01.11.2022,
// https://www.moex.com/s1166 read on 2026-10-24: shares, depositary
// receipts and exchange-fund units in the T+ book use the maker-taker
// model, maker 0, taker 0.01725% (exchange) + 0.01275% (NCC clearing) =
// 0.03% of the trade, at least 0.02 RUB a trade (0.01 + 0.01). A round
// trip that crosses the book is a taker on both sides. The page sets no
// separate rate for trades settled in yuan, so the same percentage applies.
//
// Moscow Exchange currency-market tariff, edition of 1 April 2025,
// https://www.moex.com/files/4t80367v8kv113bymqrhmwmb4a read on
// 2026-10-24, used only when a yuan line must be bought with rubles
// (a broker whose account holds rubles alone). CNYRUB trades in lots of
// 1,000 yuan:
//   whole lots, order under 50 lots  taker 0.0045%, at least 50 RUB a trade
//   whole lots, 50 lots or more      taker 0.0045%, at least 1 RUB
//   small lots (TMS, under 1,000)    taker 0.075%, at least 1 RUB
// A conversion is priced the cheaper way a client can place it: its whole
// lots plus the remainder in small lots, or small-lot orders only (each at
// most 999.99 yuan, so at least 1 RUB an order).
//
// Every amount is worked in rubles (turnover bands, minimums and the
// exchange tariff are all in rubles; a yuan amount is taken at the fx.mjs
// rate, as the tariffs take it at the Bank of Russia rate) and turned into
// dollars at the end.
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

export const MOEX_PAGE = "https://www.moex.com/s1166";
export const MOEX_FX_PAGE = "https://www.moex.com/files/4t80367v8kv113bymqrhmwmb4a";
export const MOEX_TAKER = 0.0003;
export const MOEX_MIN_RUB = 0.02;
export const MOEX_BASIS =
  "frais de la Bourse de Moscou en sus : preneur 0,01725 % (bourse) + 0,01275 % (NCC) = 0,03 %, au moins 0,02 RUB, chaque sens";

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
export const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
export const joinRemarks = (...xs) => xs.map((x) => String(x || "").trim()).filter(Boolean).join(" ");
/** 0.0006 -> "0.06%" */
export const pct = (r) => `${Number((r * 100).toFixed(4))}%`;

/** Rubles per unit of `currency`, from the fx.mjs dollar rates. */
export function rubPer(currency) {
  const c = code(currency);
  if (c === "RUB") return 1;
  const a = usdPer(c);
  const b = usdPer("RUB");
  return a == null || !b ? null : a / b;
}

/** Bands on a ruble turnover, `upTo` inclusive; the band prices all of it. */
export function bandRate(bands, turnoverRub) {
  return bands.find((band) => turnoverRub <= band.upTo).rate;
}

/** Moscow Exchange stock-market fee for one trade crossing the book. */
export function moexLevyRub(amountRub) {
  return Math.max(amountRub * MOEX_TAKER, MOEX_MIN_RUB);
}

/** Moscow Exchange currency-market fee for buying or selling `units` yuan. */
export function moexFxLevyRub(units, rubPerUnit) {
  const lots = Math.floor(units / 1000);
  const rest = units - lots * 1000;
  let mixed = 0;
  if (lots > 0) mixed += Math.max(lots * 1000 * rubPerUnit * 0.000045, lots < 50 ? 50 : 1);
  if (rest > 0) mixed += Math.max(rest * rubPerUnit * 0.00075, 1);
  // Or small-lot orders only (each at most 999.99 yuan).
  const orders = Math.ceil(units / 999.99);
  const small = Math.max(units * rubPerUnit * 0.00075, orders * 1);
  return Math.min(mixed, small);
}

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
 *   folder, brand, catalogue (URL), page, readOn,
 *   plans: { id: { id, name, remark, fx (remark rate, 0..1, or null), fxExtra, sheet,
 *                  convert: { rate, min, basis } | null  (forced RUB→CCY conversion),
 *                  fees(ctx) } },
 *   defaultPlan,
 * }
 * fees(ctx) gets { plan, row, listing, etf, ccy, n, notional, notionalRub, turnoverRub, rubPerUnit }
 * and returns { rate, buyRub, sellRub, levyRub (null = unknown), basis, remark, confidence, detail }.
 */
export function makeRoundTrip(cfg) {
  const catalogue = fs.existsSync(cfg.catalogue) ? JSON.parse(fs.readFileSync(cfg.catalogue, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);
  // A remark on converting only when the account can hold more than rubles.
  const many = ["USD", "EUR", "CNY", "BYN", "TRY", "KZT", "AED", "HKD"].some((c) => depositHas(cfg.folder, null, c));

  return function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
    const chosen = cfg.plans[String(plan || cfg.defaultPlan)] || cfg.plans[cfg.defaultPlan];
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy: true,
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
    const held = depositHas(cfg.folder, chosen.id, ccy);
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
    const brokerRub = fee.buyRub + fee.sellRub;
    // Forced conversion: rubles to the listing currency before the buy,
    // back after the sale; broker's rate (with its floor) and the
    // currency-market fee, each way.
    const fxRub = convert
      ? 2 * (Math.max(notionalRub * convert.rate, convert.min || 0) + moexFxLevyRub(notional, rpu))
      : 0;
    const brokerFees = dollars(brokerRub + fxRub, "RUB");
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
        courtage: finite(dollars(brokerRub, "RUB"), 6),
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

/** The CLI every cost file shares. */
export function cli(metaUrl, roundTrip) {
  let called = false;
  try {
    called = metaUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(
    JSON.stringify(
      roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")), plan: arg("plan", null) }),
      null,
      2
    )
  );
}
