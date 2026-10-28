// What one round trip costs on B3 (São Paulo), the part every Brazilian
// home broker shares: the exchange's own fees, the lot split, the old
// Bovespa brokerage table, the taxes some brokers add on top of their
// brokerage, and a roundTrip factory with the contract of
// brokers/toro/toro_cost.mjs. A broker file hands it its own brokerage.
//
// B3 fee page, read on 2026-10-26 (same figures Toro read on 2026-10-15).
//   https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/listados-a-vista-e-derivativos/renda-variavel/tarifas-de-acoes-e-fundos-de-investimento/a-vista/
//
//   Regular order, each side, on the     "0 a 3": negociação 0,00500 %,
//   amount; the band is the investor's    CCP 0,02240 %, TTA 0,0026 %,
//   own average day for the month (R$m)   total 0,0300 %. Above R$3 million
//                                         a day is not a retail order.
//   Day trade, each side                  "0 a 0,2": negociação 0,00500 %,
//                                         CCP 0,01800 %, total 0,0230 %,
//                                         no TTA.
//   Opening or closing auction            negociação 0,007 %. Not this order.
//   The same table for shares, units, BDRs, ETFs and listed funds, every
//   investor. "As tarifas incluem PIS e COFINS ... e ISS": nothing to add.
//
// Lots. A Brazilian share or unit trades in lots of 100; 1 to 99 go to the
// odd-lot book (the ticker plus F), a separate order. BDRs and ETFs trade
// in lots of 1 since B3 cut the lot (2020/2021):
//   https://www.infomoney.com.br/?p=1522631
// The book (spreads/spread.json, BVMF, the delayed touch on the IBKR
// portal) is the round-lot book; the odd-lot book is not read.
//
// Bovespa table, the old exchange brokerage scale many brokers still use
// whole or with a discount (Banrisul's desk prints it at -30 %: R$1.89,
// 1.40 %, 1.05 % + R$1.74, 0.70 % + R$7.04, 0.35 % + R$17.65, which is this
// table times 0.7). Per order, the band's rate on the whole order value:
//   up to R$135.07              R$2.70
//   R$135.08 to R$498.62        2.0 %
//   R$498.63 to R$1,514.69      1.5 % + R$2.49
//   R$1,514.70 to R$3,029.38    1.0 % + R$10.06
//   R$3,029.39 and above        0.5 % + R$25.21
//   https://www.banrisulcorretora.com.br/lxa/link/custos-tarifas.html
//
// Remark. "Same day sell fees are x% lower.": the round trip's fees (brokerage +
// B3) when bought and sold the same day, x in percent of the regular round
// trip's fees, not of the amount (cutPercent).
//
// Left out everywhere: IRRF "dedo-duro" (0.005 % of a sale, 1 % of a day-
// trade gain) is an income-tax advance, credited against the tax, not a
// cost; B3 custody is waived for individuals at the brokers read so far.
//
//   import { makeB3Cost, printB3Cli, bovespaTable, withTaxes } from "../nubank/b3Cost.mjs";
//   export const roundTrip = makeB3Cost({ folder, name, catalogue, url, readOn,
//     brokerage: ({ legs, side, dayTrade, row }) => ..., basis, remark });
//   printB3Cli(roundTrip, import.meta.url);
//
//   node brokers/nubank/b3Cost.mjs --self-test

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

export const B3_FEES_URL =
  "https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/listados-a-vista-e-derivativos/renda-variavel/tarifas-de-acoes-e-fundos-de-investimento/a-vista/";
export const B3_READ_ON = "2026-10-26";
export const NEGOTIATION = 0.00005;
export const CCP = 0.000224;
export const TRANSFER = 0.000026;
export const SIDE = NEGOTIATION + CCP + TRANSFER; // 0.030 %
export const DAY_NEGOTIATION = 0.00005;
export const DAY_CCP = 0.00018;
export const DAY_TRADE = DAY_NEGOTIATION + DAY_CCP; // 0.023 %
export const AUCTION_NEGOTIATION = 0.00007;
export const LOT = 100;

// PIS 0.65 % + COFINS 4 % + ISS 5 %, the line Safra and Toro print as
// "acrescidos de": 9.65 % on the brokerage.
export const PIS_COFINS_ISS = 0.0065 + 0.04 + 0.05;

export const BOVESPA_TABLE = [
  { upTo: 135.07, rate: 0, fixed: 2.7 },
  { upTo: 498.62, rate: 0.02, fixed: 0 },
  { upTo: 1514.69, rate: 0.015, fixed: 2.49 },
  { upTo: 3029.38, rate: 0.01, fixed: 10.06 },
  { upTo: Infinity, rate: 0.005, fixed: 25.21 },
];

export function real(amount) {
  return Math.round(amount * 100 + Number.EPSILON) / 100;
}

// B3's fee on one side of the trade (all legs of that day together), in
// reais, rounded to the centavo.
export function b3Side(notional, { dayTrade = false } = {}) {
  return real(notional * (dayTrade ? DAY_TRADE : SIDE));
}

// A Brazilian share or unit: lot 100. A BDR (ISIN BR....BDR...., or a
// ticker ending 31-35/39), an ETF or an ETN: lot 1.
export function lotOf(row) {
  const type = String(row?.type || "").toUpperCase();
  if (type !== "STOCK") return 1;
  const isin = String(row?.isin || "").toUpperCase();
  const ticker = String(row?.ticker || "").toUpperCase();
  if (isin.slice(6, 9) === "BDR" || /3[1-59]$/.test(ticker)) return 1;
  return isin && !isin.startsWith("BR") ? 1 : LOT;
}

// The orders one side becomes: the round lots, then the odd lot on its own
// book. Fractional shares (the front sizes by amount) stay in the odd leg.
export function splitLegs(row, shares, price) {
  const lot = lotOf(row);
  // Lot 1: one order, whatever fraction the front's sizing leaves.
  if (lot === 1) return [{ shares, notional: shares * price, odd: false }];
  const round = Math.floor(shares / lot + 1e-9) * lot;
  const odd = shares - round > 1e-9 ? shares - round : 0;
  const legs = [];
  if (round > 0) legs.push({ shares: round, notional: round * price, odd: false });
  if (odd > 0) legs.push({ shares: odd, notional: odd * price, odd: lot > 1 });
  return legs;
}

// The Bovespa table on one order, times (1 − discount), to the centavo.
export function bovespaTable(orderValue, { discount = 0 } = {}) {
  const band = BOVESPA_TABLE.find((b) => orderValue <= b.upTo);
  return real((orderValue * band.rate + band.fixed) * (1 - discount));
}

// A brokerage plus the taxes a broker prints as added on top of it.
export function withTaxes(brokerage, rate = PIS_COFINS_ISS) {
  return real(brokerage * (1 + rate));
}

// Per-order helpers for a broker's `brokerage` callback.
export const perOrder = (legs, fn) => real(legs.reduce((sum, leg) => sum + fn(leg), 0));

// How much lower `reduced` is than `normal`, in percent of `normal` (a cut
// on the fee itself, not on the trade amount): whole from 10 up, one
// decimal below; 0 when there is no cut, negative when `reduced` is more.
export function cutPercent(normal, reduced) {
  if (!(normal > 0) || reduced == null) return 0;
  const x = (100 * (normal - reduced)) / normal;
  return Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
}

// "Same day sell fees are x% lower." from the two round trips, in reais: x in
// percent of the regular round trip's fees (brokerage + B3).
export function sameDayRemark(regular, dayTrade) {
  if (regular == null || dayTrade == null) return "";
  const gap = cutPercent(regular, dayTrade);
  if (!gap) return "";
  return `Same day sell fees are ${Math.abs(gap)}% ${gap > 0 ? "lower" : "higher"}.`;
}

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// options:
//   folder, name         "nubank", "Nubank"
//   catalogue            new URL("<folder>-parsed.json", import.meta.url)
//   url, readOn          the broker's fee page and the day it was read
//   brokerage(ctx)       reais for one side, or null when unknown. ctx:
//                        { legs, notional, side: "buy"|"sell", dayTrade, row }
//                        (legs from splitLegs: one order each)
//   basis                French sentence on the broker's tariff
//   remark               English cost remark (string, or fn(ctx) → string)
//   cash                 deposit currency, "BRL"
//   onlineBuy            false for a desk/phone-only line
//   confidence           optional
export function makeB3Cost({
  folder,
  name,
  catalogue: catalogueUrl,
  url,
  readOn,
  brokerage,
  basis = "",
  remark = "",
  cash = "BRL",
  onlineBuy = true,
  confidence = null,
}) {
  const catalogue = fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);

  function findListing({ etf, place, currency }) {
    const asked = loose(etf);
    const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
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

  return function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy,
      cashCurrency: cash,
      url,
      remark: typeof remark === "string" ? remark : "",
    };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${name} n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing({ etf, place, currency });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${name}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${name}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
      };
    }

    const m = matches[0];
    const book = spreadLeaf(spreads, {
      isin: m.row.isin,
      mic: m.venue?.mic ?? null,
      currency: m.row.currency,
      unsourced: m.unsourced,
      broker: folder,
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
    const marketBp = bp ?? book.leaf?.bp ?? null;
    const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
    const shared = {
      ...answer,
      listing,
      basis: [basis, `B3 : 0,030 % par côté sur un ordre ordinaire (première tranche), barème B3 relu le ${B3_READ_ON}.`]
        .filter(Boolean)
        .join(" "),
      ...(confidence ? { confidence } : {}),
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
      bp: marketBp,
      perShare: marketPerShare,
    };

    const n = Number(shares);
    const p = Number(price);
    if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
    if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

    const notional = n * p;
    const legs = splitLegs(m.row, n, p);
    const ctx = (side, dayTrade) => ({ legs, notional, side, dayTrade, row: m.row, shares: n, price: p });
    const fee = (side, dayTrade) => {
      const b = brokerage(ctx(side, dayTrade));
      return b == null ? null : real(b);
    };
    const buy = fee("buy", false);
    const sell = fee("sell", false);
    const b3 = b3Side(notional);
    const local = buy == null || sell == null ? null : real(buy + sell + 2 * b3);

    const dayBuy = fee("buy", true);
    const daySell = fee("sell", true);
    const dayLocal = dayBuy == null || daySell == null ? null : real(dayBuy + daySell + 2 * b3Side(notional, { dayTrade: true }));
    const extra = typeof remark === "function" ? remark(ctx("buy", false)) : remark;
    const remarks = [extra, sameDayRemark(local, dayLocal)].filter(Boolean).join(" ");

    const notionalUsd = dollars(notional, listing.currency);
    const brokerFees = local == null ? null : dollars(local, listing.currency);
    const parts = bookParts({
      bp: marketBp,
      perShare: marketPerShare,
      venue: m.venue,
      unsourced: m.unsourced,
      toUsd: (amount) => dollars(amount, listing.currency),
    });
    const bookUsd =
      parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
    const usd = plus(bookUsd, brokerFees);

    return {
      ...shared,
      remark: remarks,
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      ...(local == null
        ? { why: `courtage ${name} inconnu pour cet ordre` }
        : bookUsd == null
          ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
          : {}),
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
      commission: {
        brokerage: { buy, sell },
        b3: { buy: b3, sell: b3, negotiation: NEGOTIATION, ccp: CCP, transfer: TRANSFER },
        orders: legs.map((leg) => ({ shares: leg.shares, notional: real(leg.notional), oddLot: leg.odd })),
        sameDay: dayLocal,
        total: local,
        currency: listing.currency,
      },
    };
  };
}

// The CLI every cost file prints: node <file> TICKER B3 BRL --shares= --price=
export function printB3Cli(roundTrip, metaUrl) {
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
      roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }),
      null,
      2
    )
  );
}

function selfTest() {
  const eq = (a, b, what) => {
    if (Math.abs(a - b) > 1e-9) throw new Error(`${what}: ${a} ≠ ${b}`);
  };
  eq(SIDE, 0.0003, "B3 side");
  eq(DAY_TRADE, 0.00023, "B3 day trade");
  eq(b3Side(5126.4), 1.54, "B3 on R$5,126.40");
  eq(b3Side(5126.4, { dayTrade: true }), 1.18, "B3 day trade on R$5,126.40");
  eq(bovespaTable(100), 2.7, "Bovespa band 1");
  eq(bovespaTable(300), 6, "Bovespa band 2");
  eq(bovespaTable(1000), 17.49, "Bovespa band 3");
  eq(bovespaTable(2000), 30.06, "Bovespa band 4");
  eq(bovespaTable(5000), 50.21, "Bovespa band 5");
  eq(bovespaTable(5000, { discount: 0.3 }), 35.15, "Bovespa -30 %");
  eq(bovespaTable(100, { discount: 0.3 }), 1.89, "Banrisul desk band 1");
  eq(withTaxes(4.5), 4.93, "R$4.50 + PIS/COFINS/ISS");
  eq(lotOf({ type: "STOCK", isin: "BRPETRACNPR6", ticker: "PETR4" }), 100, "PETR4 lot");
  eq(lotOf({ type: "STOCK", isin: "BRAAPLBDR004", ticker: "AAPL34" }), 1, "AAPL34 lot");
  eq(lotOf({ type: "ETF", isin: "BRBOVACTF003", ticker: "BOVA11" }), 1, "BOVA11 lot");
  const legs = splitLegs({ type: "STOCK", isin: "BRPETRACNPR6", ticker: "PETR4" }, 106.6, 48.07);
  eq(legs.length, 2, "PETR4 legs");
  eq(legs[0].shares, 100, "PETR4 round lot");
  eq(legs[1].shares, 6.6, "PETR4 odd lot");
  eq(splitLegs({ type: "ETF", isin: "BRBOVACTF003" }, 25.3, 202.42).length, 1, "BOVA11 one order");
  if (sameDayRemark(3.08, 2.36) !== "Same day sell fees are 23% lower.") throw new Error("same-day remark");
  if (sameDayRemark(25.9, 15.9) !== "Same day sell fees are 39% lower.") throw new Error("same-day remark, brokerage cut");
  eq(cutPercent(4.5, 4.2), 6.7, "cut below 10 %");
  eq(cutPercent(4.5, 0), 100, "free");
  console.log("b3Cost self-test ok");
}

try {
  if (import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes("--self-test")) selfTest();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
