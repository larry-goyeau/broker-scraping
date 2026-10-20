// What one round trip costs at T-Investments (АО «ТБанк»): buy n shares or
// fund units on the Moscow Exchange or the SPB Exchange and sell them back
// the same day, in dollars. Every catalogue line is in rubles, and rubles
// are a deposit currency (deposits.mjs), so nothing is converted.
//
// The three tariffs, each a row (`query.plan`), read on 2026-10-20:
//   https://www.tbank.ru/invest/tariffs/
//   https://www.tbank.ru/invest/help/brokerage/account/get-bs/tariff/
//   Инвестор (the default on opening), sheet Т-ИНВЕСТ-260424:
//     https://cdn.tbank.ru/static/documents/invest-tariff-fees.pdf
//     1.1 shares, ETF and depositary receipts 0.3% of each trade (0.31% for
//     an iceberg order, not this ticket); 1.3 currency 0.9%; 9 account
//     upkeep free.
//   Трейдер, sheet Т-ТРЕЙД-260522:
//     https://cdn.tbank.ru/static/documents/invest-tariff-trader.pdf
//     1.1 0.05% (iceberg 0.06%); 1.3 currency 0.5%; 9.4 account upkeep
//     390 RUB per monthly period with a trade, free with 1.5 million RUB
//     held all month (9.2) or 5 million RUB traded the month before (9.3).
//     The month is in the remark and stays out of the trip.
//   Премиум, sheet Т-ПРЕМ-260603, open only with the bank's Premium
//     service:
//     https://cdn.tbank.ru/static/documents/invest-tariff-premium.pdf
//     1.1 0.04% (iceberg 0.05%); 1.3 currency 0.4%; 12 account upkeep free.
//     The Premium service is 2,990 RUB a month, free with 3 million RUB
//     held at T-Bank (tariffs page and help page); in the remark.
// On all three, item "Биржевая комиссия" (10, 10, 13) is free: the
// exchange and clearing fees of the Moscow and SPB exchanges are inside
// the rate (the only exception is SPB futures). Rule 1: each commission is
// rounded to 0.01 and is at least 0.01 in the trade's currency.
//
// T-Capital's own exchange-traded funds (БПИФ УК «Т-Капитал»): the help
// page of T-Capital, read on 2026-10-20,
//   https://www.tbank.ru/invest/help/services/capital/about/how-to-invest/
// says they trade with no commission through T-Investments; TMOS, TRUR and
// TGLD are free for 15 orders a day, the standard rate from the 16th. A
// round trip is two orders, so it pays nothing. The funds are known by
// ISIN below (manager checked on the Moscow Exchange's ISS record).
//
// Left out: iceberg orders, OTC (item 3) and placements (item 4) are
// other tickets. Custody, deposits and withdrawals are free.
//
//   node brokers/tinvest/tinvest_cost.mjs SBER MISX RUB --shares=10 --price=286
//   node brokers/tinvest/tinvest_cost.mjs SBER MISX RUB --shares=10 --price=286 --plan=trader
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

const CATALOGUE = new URL("tinvest-parsed.json", import.meta.url);
const PAGE = "https://www.tbank.ru/invest/tariffs/";
const HELP_PAGE = "https://www.tbank.ru/invest/help/brokerage/account/get-bs/tariff/";
const CAPITAL_PAGE = "https://www.tbank.ru/invest/help/services/capital/about/how-to-invest/";
const READ_ON = "2026-10-20";
const CASH = "RUB";

// rate: item 1.1; fx: item 1.3, buying or selling a currency, the remark
// for cash held in another deposit currency.
const PLANS = {
  investor: {
    id: "investor",
    name: "Инвестор",
    rate: 0.003,
    fx: 0.009,
    sheet: "https://cdn.tbank.ru/static/documents/invest-tariff-fees.pdf",
    remark: "",
    basis: "tarif Инвестор (Т-ИНВЕСТ-260424) : 0,3 % de chaque opération, frais de bourse compris (point 10), sans frais de tenue de compte",
  },
  trader: {
    id: "trader",
    name: "Трейдер",
    rate: 0.0005,
    fx: 0.005,
    sheet: "https://cdn.tbank.ru/static/documents/invest-tariff-trader.pdf",
    remark: "Account fee is RUB 390 a month with trades, free from RUB 1.5 million held.",
    basis: "tarif Трейдер (Т-ТРЕЙД-260522) : 0,05 % de chaque opération, frais de bourse compris (point 10) ; 390 RUB par mois avec opérations, hors aller-retour",
  },
  premium: {
    id: "premium",
    name: "Премиум",
    rate: 0.0004,
    fx: 0.004,
    sheet: "https://cdn.tbank.ru/static/documents/invest-tariff-premium.pdf",
    remark: "Premium service is RUB 2,990 a month, free from RUB 3 million held.",
    basis: "tarif Премиум (Т-ПРЕМ-260603) : 0,04 % de chaque opération, frais de bourse compris (point 13) ; service Premium 2 990 RUB par mois, hors aller-retour",
  },
};
const DEFAULT_PLAN = "investor";

// T-Capital's exchange-traded funds in the catalogue.
const T_CAPITAL = new Set([
  "RU000A108WX3", // TPAY
  "RU000A1039N1", // TBRU
  "RU000A107563", // TDIV
  "RU000A101X50", // TGLD
  "RU000A108BL2", // TITR
  "RU000A107597", // TLCB
  "RU000A106DL2", // TMON
  "RU000A101X76", // TMOS
  "RU000A10A1L8", // TOFZ
  "RU000A10B0G9", // TRND
  "RU000A1011U5", // TRUR
  "RU000A10FLY4", // TSAV
]);
// Free for 15 orders a day only.
const DAILY_CAP = new Set(["RU000A101X76", "RU000A1011U5", "RU000A101X50"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const joinRemarks = (...xs) => xs.map((x) => String(x || "").trim()).filter(Boolean).join(" ");
const pct = (r) => `${Number((r * 100).toFixed(2))}%`;

/** Rule 1 of the tariffs: rounded to 0.01, at least 0.01. */
export function commission(amount, rate) {
  return Math.max(Math.round(amount * rate * 100) / 100, 0.01);
}

export function isTCapitalFund(row) {
  return code(row?.type) === "ETF" && T_CAPITAL.has(code(row?.isin));
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

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const chosen = PLANS[String(plan || DEFAULT_PLAN)] || PLANS[DEFAULT_PLAN];
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: PAGE,
    remark: chosen.remark,
    plan: chosen.id,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue T-Investments n'existe pas encore : lancer `node brokers/tinvest/tinvest_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue T-Investments` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez T-Investments`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "tinvest",
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
  const ownFund = isTCapitalFund(m.row);
  const capped = ownFund && DAILY_CAP.has(listing.isin);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const basis = ownFund
    ? `tarifs T-Investments relus le ${READ_ON} : un БПИФ de T-Capital s'achète et se vend sans commission (page d'aide T-Capital)` +
      (capped ? ", dans la limite de 15 ordres par jour, ce que l'aller-retour (2 ordres) respecte." : ".")
    : `tarifs T-Investments relus le ${READ_ON}, ${chosen.basis}. Commission arrondie au centime, au moins 0,01 RUB (règle 1).`;
  const shared = {
    ...answer,
    remark: [
      joinRemarks(m.row.remark, chosen.remark, capped ? `Free for 15 orders a day, then ${pct(chosen.rate)}.` : ""),
      fxRemark(100 * chosen.fx, listing.currency),
    ]
      .filter(Boolean)
      .join("\n"),
    listing,
    basis,
    ...(ownFund
      ? { confidence: "la page d'aide dit « la plupart » des fonds T-Capital sans commission et ne nomme que TMOS, TRUR et TGLD comme exceptions plafonnées ; tous les БПИФ T-Capital du catalogue sont pris à 0" }
      : {}),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!depositHas("tinvest", chosen.id, listing.currency)) {
    return { ...shared, why: `${listing.currency} n'est pas une devise de dépôt T-Investments` };
  }
  if (listing.currency !== CASH) {
    return { ...shared, cashCurrency: listing.currency, why: `pas de ligne en ${listing.currency} relue` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const rate = ownFund ? 0 : chosen.rate;
  const side = ownFund ? 0 : commission(notional, rate);
  const brokerRub = side * 2;
  const brokerFees = dollars(brokerRub, CASH);
  const taxPct = Object.values(taxRates(taxesOf(listing.isin))).reduce((sum, r) => sum + r, 0);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { plan: chosen.name, rate, buy: side, sell: side, eachWay: true, currency: CASH, ownFund },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      courtageRub: finite(brokerRub, 6),
      fraisBourseRub: 0,
    },
    sources: { fees: chosen.sheet, plans: PAGE, help: HELP_PAGE, ...(ownFund ? { fund: CAPITAL_PAGE } : {}) },
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
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

printCli();
