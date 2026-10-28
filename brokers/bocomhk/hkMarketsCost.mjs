// Shared machinery for the Hong Kong brokers that sell HKEX lines,
// Northbound Stock Connect A-shares (SSE, SZSE) and US lines (listed,
// sometimes OTC Markets) from one account: buy n shares at price p, sell them
// straight back, in dollars. Each broker file keeps its own fee schedule; this
// file finds the row, the book, the cash and the conversion.
//
// Two ways in, one catalogue lookup and one book underneath:
//
//   marketsRoundTrip(schedule, query)   the whole trip for a broker that
//     writes its fee lines as one function per market (bocomhk, ccbi,
//     cswealth, centralchinahk, citibankhk, eddid, elebank, innovax).
//
//   engineOf(catalogueUrl, query) → "HK" | "CN" | "US", for a broker that
//     prices HKEX on ../primehk/hkexCost.mjs `hkexRoundTrip` and the US on
//     ../wellstrade/usCost.mjs `usRoundTrip` (welllink, valuable, usmarthk,
//     mox, standardcharteredhk, chiyu, shkdirect), with
//     connectRoundTrip(schedule, query) for its Stock Connect lines and
//     adjust() / addRemark() for what those engines do not have.
//
// Statutory charges, read 2026-10-26 (the HKEX rates come from
// ../primehk/hkexCost.mjs, which quotes HKEX and the IRD):
//   HKEX, each side: SFC 0.0027 %, AFRC 0.00015 %, HKEX trading fee
//     0.00565 %, each to the cent; stamp 0.1 % of the HKD value rounded up
//     to the next dollar, none on an ETF or ETN (2015 waiver) or a REIT
//     (from 21 Dec 2024). The CCASS / settlement line is the broker's own
//     (each schedule prints it, or prints it as free).
//   Stock Connect (Northbound), each side on the consideration, as every
//   schedule of these brokers prints them (HKEX "Stock Connect – Fees and
//   charges"):
//     A share  handling fee (SSE / SZSE)      0.00341 %
//              securities management (CSRC)   0.002 %
//              transfer fee ChinaClear         0.001 %
//              transfer fee HKSCC              0.002 %
//              stamp duty (SAT)                0.05 % on the sale only
//     ETF      handling fee 0.004 %, HKSCC transfer 0.002 %; no CSRC fee, no
//              ChinaClear transfer fee, no stamp.
//     https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Reference-Materials/Fees-and-Charges?sc_lang=en
//     The HKSCC portfolio fee (0.008 % a year of the holding) is not per
//     trade. An A-share board lot is 100 shares (`CN_LOT`).
//   United States: each broker prints its own SEC / TAF / CAT / clearing
//     lines; an unprinted one stays at 0 (owner's rule). In
//     marketsRoundTrip the Italian and French FTTs are on the day's net
//     purchase, zero on a round trip; usRoundTrip has its own tax map.
//
// Cash (marketsRoundTrip): a line in a deposit currency of the folder
// (deposits.mjs; CNY is held as CNH) converts nothing, and a USD or CNH line
// gets the "FX x% when cash ≠ CCY." remark. A line outside the deposit list
// is a forced conversion: `schedule.fxEach` (one leg, a fraction) prices it
// in the total; null leaves the total unknown. connectRoundTrip reads the
// same rule from `schedule.cash` and prints no FX remark.
//
// US book (marketsRoundTrip): the 605 figure times the Q of the broker's 606
// alias (spreads/rule606.mjs ALIASES[folder]), else the quoted NBBO. OTC
// lines keep the OTC Markets touch.
//
// markets schedule (marketsRoundTrip): {
//   broker, folder, catalogueUrl, readOn, url, pages: { HK, CN, US, OTC },
//   channel        French words on the order channel,
//   basis          { HK, CN, US, OTC } French words on each fee table,
//   fxPct, fxExtra the remark's figure and its tail ("" when unpublished);
//                  fxPct may be { USD, CNH } when each currency has its own,
//   fxEach, fxLabel forced conversion (one leg) and its French source,
//   remark         English remark on every line, optional,
//   usBook         French words on the US book, optional,
//   markets        { HK, CN, US, OTC }: (ctx) => { broker, levy, tax, remark?, note?, buy?, sell? }
//                  trip totals in the listing currency. ctx = { n, p,
//                  notional, currency, ccy, fund, free, row, lot, hkd(x) }.
// }
//
// connect schedule (connectRoundTrip): {
//   broker, folder, catalogueUrl, url, readOn,
//   channel     French words on the order channel,
//   commission  { rate, min } in RMB, each side,
//   perOrder    RMB per order (platform fee), each side, default 0,
//   levies      { stock: {handling, csrc, chinaClear, hkscc}, etf: {...} }, default above,
//   stamp       sale-side stamp on a share, default 0.0005,
//   round       "exact" (default) | "cent" (each line to the nearest fen)
//               | "cent-min" (nearest fen, at least 0.01 a line),
//   buyCharge   ({ shares, notional, lots }) -> RMB on the purchase, optional,
//   buyChargeLabel French words for it,
//   cash        deposit currencies (default from deposits.mjs),
//   fxEach      one-leg FX fraction when CNH is not a deposit currency, or null,
//   onlineBuy   default true,
//   remark      English remark, optional,
// }
//
// `adjust(result, …)` folds a per-trip amount in the listing currency into
// a result of any engine (a buy-only charge, a free odd lot, a clearing fee
// that the US ticket carried and that belongs with the levies).
//
// Everything reads files, never the network.

import { rowsNamed } from "../../listingIndex.mjs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { HKEX, stampFree, frPct } from "../primehk/hkexCost.mjs";
import { loadRows } from "../wellstrade/usCost.mjs";

export { HKEX, frPct };

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
export const cents = (x) => Math.round(x * 100 + 1e-9) / 100;
const tidy = (x) => (x == null ? null : Math.abs(x) < 5e-5 ? 0 : finite(x, 6));
// fx.mjs folds CNH into CNY; the catalogue and the deposit list write CNH.
export const cashKey = (ccy) => (listingCash(ccy) === "CNY" ? "CNH" : listingCash(ccy));
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
export function convert(amount, from, to) {
  if (amount == null) return null;
  if (cashKey(from) === cashKey(to)) return amount;
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  return usd == null || !(per > 0) ? null : usd / per;
}

/** Deposit currencies of a folder among HKD, USD and CNH (deposits.mjs). */
export function cashOf(folder, plan = null) {
  return ["HKD", "USD", "CNH"].filter((c) => depositHas(folder, plan, c));
}

// ------------------------------------------------------------ fee lines

// A rate line { rate, min, max } on one side, to the cent. min and max are
// already in the listing currency.
export function rateLine(notional, { rate = 0, min = 0, max = Infinity } = {}) {
  return cents(Math.min(max, Math.max(min, notional * rate)));
}

// HKEX statutory charges of one side, in the listing currency.
export function hkStatutory(notional, currency, { free = null, levyMin = 0 } = {}) {
  const sfc = Math.max(levyMin, cents(notional * HKEX.sfc));
  const afrc = cents(notional * HKEX.afrc);
  const trading = Math.max(levyMin, cents(notional * HKEX.trading));
  let stamp = 0;
  if (!free) {
    const hkd = convert(notional, currency, "HKD");
    if (hkd == null) return null;
    const stampHkd = Math.ceil(hkd * HKEX.stamp - 1e-9);
    stamp = code(currency) === "HKD" ? stampHkd : cents(convert(stampHkd, "HKD", currency));
  }
  return { sfc, afrc, trading, levies: sfc + afrc + trading, stamp };
}

export const CN_LOT = 100;
export const CONNECT = {
  stock: { handling: 0.0000341, csrc: 0.00002, chinaClear: 0.00001, hkscc: 0.00002 },
  etf: { handling: 0.00004, csrc: 0, chinaClear: 0, hkscc: 0.00002 },
  stamp: 0.0005,
  url: "https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Reference-Materials/Fees-and-Charges?sc_lang=en",
};
const sideRate = (l) => l.handling + l.csrc + l.chinaClear + l.hkscc;
// The Stock Connect rates of one side, summed.
export const CN_LEVY = {
  stock: sideRate(CONNECT.stock),
  etf: sideRate(CONNECT.etf),
  stamp: CONNECT.stamp,
};

// Stock Connect statutory charges for the whole trip: levies both sides,
// stamp on the sale.
export function cnStatutory(notional, fund) {
  return {
    levy: notional * (fund ? CN_LEVY.etf : CN_LEVY.stock) * 2,
    tax: fund ? 0 : notional * CN_LEVY.stamp,
  };
}

// US regulatory and clearing lines for the whole trip, in USD.
//   sec    { rate, min }           on the sale
//   taf    { perShare, min, max }  on the sale
//   cat    { perShare, min }       each side
//   settle { perShare, min }       each side (clearing / settlement)
export function usRegulatory(n, notional, { sec = null, taf = null, cat = null, settle = null } = {}) {
  const each =
    (cat ? Math.max(cat.min || 0, cents(n * cat.perShare)) : 0) +
    (settle ? Math.max(settle.min || 0, cents(n * settle.perShare)) : 0);
  const secFee = sec ? Math.max(sec.min || 0, cents(notional * sec.rate)) : 0;
  const tafFee = taf ? Math.min(taf.max ?? Infinity, Math.max(taf.min || 0, cents(n * taf.perShare))) : 0;
  return each * 2 + secFee + tafFee;
}

// ------------------------------------------------------------ remarks

// "Fees might be x% lower if …" (owner's wording, 2026-10-22/24): x is the
// cut on the broker's own fee, buy and sell together, relative to that fee
// on the same order (owner's rule, 2026-10-27): 0.25 % → 0.10 % is "60%
// lower", a free tier "100% lower". Whole numbers from 10, one decimal below.
export function lowerRemark(saved, base, condition) {
  const x = pctOf(saved, base);
  return x ? `Fees might be ${x}% lower if ${condition}.` : "";
}

/** "x" of "x% lower": a saving over the fee it is cut from (same currency), in percent; 0 when none. */
export function pctOf(delta, base) {
  if (!(base > 0) || !(delta > 0)) return 0;
  const x = (100 * delta) / base;
  return x >= 9.95 ? Math.round(x) : Number(x.toFixed(1));
}

/** Appends an English remark. */
export function addRemark(result, text) {
  if (!text) return result;
  return { ...result, remark: [result.remark, text].filter(Boolean).join(" ") };
}

/**
 * Adds per-trip amounts, in the listing currency, to a result: `broker` to
 * the broker's fees, `levy` to the exchange / clearing part (either may be
 * negative to move an amount from one to the other). `buy` / `sell` are the
 * per-side changes of the commission block, when the change is one-sided.
 */
export function adjust(result, { broker = 0, levy = 0, buy = null, sell = null, note = null } = {}) {
  const ccy = result?.trade?.currency || result?.listing?.currency;
  if (!ccy || (!broker && !levy)) return note ? { ...result, confidence: [result.confidence, note].filter(Boolean).join(" ; ") } : result;
  const b = dollars(broker, ccy) ?? null;
  const l = dollars(levy, ccy) ?? null;
  if (b == null || l == null) return { ...result, usd: null, brokerFees: null, why: [result.why, `pas de cours pour ${ccy}`].filter(Boolean).join(" ; ") };
  const parts = result.parts ? { ...result.parts } : null;
  if (parts) {
    if (parts.courtage != null) parts.courtage = tidy(parts.courtage + b);
    if (parts.bourse != null) parts.bourse = tidy(parts.bourse + l);
  }
  const commission = result.commission ? { ...result.commission } : null;
  if (commission && (buy != null || sell != null)) {
    if (buy != null && commission.buy != null) commission.buy = cents(commission.buy + buy);
    if (sell != null && commission.sell != null) commission.sell = cents(commission.sell + sell);
  }
  return {
    ...result,
    usd: result.usd == null ? null : tidy(result.usd + b + l),
    brokerFees: result.brokerFees == null ? null : tidy(result.brokerFees + b),
    ...(parts ? { parts } : {}),
    ...(commission ? { commission } : {}),
    ...(note ? { confidence: [result.confidence, note].filter(Boolean).join(" ; ") } : {}),
  };
}

// ------------------------------------------------------------ catalogue

function findListing(rows, { etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = currency ? cashKey(currency) : "";
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || cashKey(m.row.currency) === wantCurrency);
  return { named, matches };
}

const US_MICS = new Set(["XNYS", "XNAS", "XASE", "ARCX", "BATS", "TXSE", "IEXG", "MEMX"]);
/** "HK", "CN", "US", "OTC" or "": the fee table of a catalogue row (marketsRoundTrip). */
export function marketOf(row) {
  const mic = code(row.mic);
  const place = loose(row.exchange);
  if (mic === "XHKG" || place === "HKEX") return "HK";
  if (mic === "XSHG" || mic === "XSHE" || place === "SSE" || place === "SZSE") return "CN";
  if (mic === "OTCM" || place.startsWith("OTC")) return "OTC";
  if (US_MICS.has(mic) || US_MICS.has(place)) return "US";
  return "";
}

/** "HK", "CN" or "US": the engine for this query, from the catalogue row it names (OTC goes to usRoundTrip). */
export function engineOf(catalogueUrl, query) {
  const rows = loadRows(catalogueUrl);
  let mic = null;
  if (rows) {
    const m = findListing(rows, query).matches[0];
    mic = m ? m.venue?.mic ?? m.row.mic ?? null : null;
  }
  if (!mic && query.place) mic = resolveVenue({ exchange: query.place, mic: query.place }).venue?.mic ?? null;
  if (mic === "XHKG") return "HK";
  if (mic === "XSHG" || mic === "XSHE") return "CN";
  if (mic) return "US";
  return "HK";
}

// The catalogue row of a query, its book and its listing block; or the
// answer that says why there is none (`miss`).
function locate(schedule, query, answer) {
  const { etf, place, currency } = query;
  const rows = loadRows(schedule.catalogueUrl);
  if (!rows) {
    return {
      miss: {
        ...answer,
        why: `le catalogue ${schedule.broker} n'existe pas encore : lancer \`node brokers/${schedule.folder}/${schedule.folder}_scraping.mjs\``,
      },
    };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { miss: { ...answer, why: `${etf} n'est pas dans le catalogue ${schedule.broker}` } };
  if (!matches.length) {
    return {
      miss: {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${schedule.broker}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
      },
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
  return { m, book, listing };
}

// Shares, price and the notional in both currencies; or the answer that
// says what is missing (`miss`).
function tradeOf(shared, query, listing) {
  const n = Number(query.shares);
  const p = Number(query.price);
  if (!(n > 0)) return { miss: { ...shared, why: "aucun nombre de parts" } };
  if (!(p > 0)) return { miss: { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" } };
  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  if (notionalUsd == null) return { miss: { ...shared, why: `aucun cours en dollars pour ${listing.currency} dans fx.mjs` } };
  return { n, p, notional, notionalUsd };
}

// The book of the trip in dollars (half spread each way), or null.
function bookUsdOf({ bp, perShare, venue, unsourced, currency, notionalUsd, n }) {
  const parts = bookParts({ bp, perShare, venue, unsourced, toUsd: (amount) => dollars(amount, currency) });
  return parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
}

const noBookWhy = (m, listing) => `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;

// French words on the book, for `confidence`.
function bookNote({ bp, perShare, m, listing, us = null }) {
  if (bp != null) return `carnet ${Number(bp.toPrecision(4))} pb`;
  if (perShare != null) {
    return us != null ? `carnet ${perShare} $ la part : ${us}` : `carnet ${perShare} ${listing.currency} par titre`;
  }
  return `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`;
}

const tradeBlock = ({ n, p, notional, notionalUsd }, currency) => ({
  shares: n,
  price: p,
  notional,
  notionalUsd: finite(notionalUsd, 6),
  currency,
});

const partsBlock = (bookUsd, brokerFees, levyUsd, taxUsd, fxUsd) => ({
  marché: finite(bookUsd, 6),
  courtage: finite(brokerFees, 6),
  bourse: finite(levyUsd, 6),
  taxes: finite(taxUsd, 6),
  change: fxUsd == null ? null : finite(fxUsd, 6),
});

// ------------------------------------------------------------ whole trip, fee lines per market

export function marketsRoundTrip(schedule, query) {
  const { etf, place, currency, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "HKD",
    url: schedule.url,
    remark: schedule.remark || "",
  };
  const found = locate(schedule, query, answer);
  if (found.miss) return found.miss;
  const { m, book, listing } = found;
  const market = marketOf(m.row);
  const ccyKey = cashKey(listing.currency);
  const held = depositHas(schedule.folder, null, ccyKey);
  const fxEach = held ? 0 : (schedule.fxEach ?? null);
  const lot = Number.isInteger(m.row.lot) && m.row.lot > 0 ? m.row.lot : null;
  const fund = listing.type === "ETF" || listing.type === "ETN";
  const free = market === "HK" ? stampFree(m.row) : null;
  const basis =
    `${schedule.channel || "ordre en ligne"}, barème ${schedule.broker} relu le ${schedule.readOn}` +
    (schedule.basis?.[market] ? ` : ${schedule.basis[market]}` : "");
  const fxPct = schedule.fxPct && typeof schedule.fxPct === "object" ? schedule.fxPct[ccyKey] : schedule.fxPct;
  const fxNote = held && ccyKey !== "HKD" ? fxRemark(fxPct || "", listing.currency, schedule.fxExtra || "") : "";

  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (market === "US" && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: schedule.folder, ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? ccyKey : "HKD",
    url: schedule.pages?.[market] || schedule.url,
    remark: [answer.remark, m.row.remark, fxNote].filter(Boolean).join("\n"),
    basis,
    lot,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? 0 : fxEach == null ? null : fxEach * 2,
    bp: marketBp,
    perShare: marketPerShare,
  };
  const fees = schedule.markets?.[market];
  if (!market || !fees) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème ${schedule.broker}` };

  const trade = tradeOf(shared, query, listing);
  if (trade.miss) return trade.miss;
  const { n, p, notional, notionalUsd } = trade;
  const hkd = (amount) => convert(amount, "HKD", listing.currency);
  const bill = fees({ n, p, notional, currency: listing.currency, ccy: ccyKey, fund, free, row: m.row, lot, hkd });
  if (!bill || bill.why) return { ...shared, why: bill?.why || `pas de cours pour ramener ${listing.currency} en HKD` };

  const brokerLocal = Number(bill.broker.toPrecision(12));
  const levyLocal = Number((bill.levy || 0).toPrecision(12));
  const taxLocal = Number((bill.tax || 0).toPrecision(12));
  const brokerFees = dollars(brokerLocal, listing.currency);
  const levyUsd = dollars(levyLocal, listing.currency);
  const taxUsd = dollars(taxLocal, listing.currency);
  const bookUsd = bookUsdOf({
    bp: marketBp,
    perShare: marketPerShare,
    venue: market === "US" && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    currency: listing.currency,
    notionalUsd,
    n,
  });
  const fxUsd = fxEach == null ? null : notionalUsd * fxEach * 2;
  const usd = plus(bookUsd, brokerFees, levyUsd, taxUsd, fxUsd);

  const why = [
    !held && fxEach == null
      ? `${ccyKey} n'est pas une devise de dépôt : change au cours maison, que ${schedule.broker} ne publie pas, total inconnu`
      : null,
    bookUsd == null ? noBookWhy(m, listing) : null,
  ].filter(Boolean).join(" ; ");
  const confidence = [
    basis,
    market === "HK" ? (free ? `pas de timbre : ${free}` : "timbre 0,1 % arrondi au dollar HK supérieur, chaque sens") : null,
    market === "HK" ? (lot ? `lot de bourse ${lot} (${Number((n / lot).toPrecision(4))} lot${n / lot >= 2 ? "s" : ""})` : "pas de lot de bourse dans le catalogue") : null,
    market === "CN" ? (fund ? "ETF : frais de traitement 0,004 % et HKSCC 0,002 %, pas de timbre" : "action A : traitement, CSRC, ChinaClear, HKSCC ; timbre 0,05 % à la vente") : null,
    bookNote({
      bp: marketBp,
      perShare: marketPerShare,
      m,
      listing,
      us: market === "US" ? schedule.usBook || "605 × Q du 606 si un alias est posé pour ce dossier, sinon NBBO coté" : null,
    }),
    market === "OTC" ? "OTC : pas de 605 ni de 606, carnet OTC Markets" : null,
    held
      ? `caisse en ${ccyKey}, pas de change`
      : fxEach == null
        ? `change forcé ${listing.currency} → HKD au cours maison non publié`
        : `change forcé ${frPct(fxEach)} par sens${schedule.fxLabel ? ` (${schedule.fxLabel})` : ""}`,
    bill.note || null,
  ].filter(Boolean).join(" ; ");

  return {
    ...shared,
    remark: [shared.remark, bill.remark].filter(Boolean).join("\n"),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: tradeBlock(trade, listing.currency),
    commission: { trip: brokerLocal, buy: bill.buy ?? brokerLocal / 2, sell: bill.sell ?? brokerLocal / 2, currency: listing.currency },
    levy: { amount: levyLocal, currency: listing.currency },
    parts: partsBlock(bookUsd, brokerFees, levyUsd, taxUsd, fxUsd),
    confidence,
  };
}

// ------------------------------------------------------------ Stock Connect, beside hkexRoundTrip / usRoundTrip

function line(x, round) {
  if (!(x > 0)) return 0;
  if (round === "cent") return cents(x);
  if (round === "cent-min") return Math.max(0.01, cents(x));
  return x;
}

export function connectRoundTrip(schedule, query) {
  const { etf, place, currency, bp = null, perShare = null } = query;
  const cash = new Set((schedule.cash || cashOf(schedule.folder)).map(code));
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: schedule.onlineBuy ?? true,
    cashCurrency: "CNH",
    url: schedule.url,
    remark: schedule.remark || "",
  };
  const found = locate(schedule, query, answer);
  if (found.miss) return found.miss;
  const { m, book, listing } = found;
  const etfLike = listing.type === "ETF" || listing.type === "ETN";
  const levies = { ...(etfLike ? CONNECT.etf : CONNECT.stock), ...((etfLike ? schedule.levies?.etf : schedule.levies?.stock) || {}) };
  const stampRate = etfLike ? 0 : schedule.stamp ?? CONNECT.stamp;
  const converts = !cash.has(cashKey(listing.currency));
  const fxEach = converts ? (schedule.fxEach ?? null) : 0;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const c = schedule.commission;
  const basis =
    `${schedule.channel || "ordre en ligne"}, barème ${schedule.broker} relu le ${schedule.readOn}. ` +
    `Stock Connect : courtage ${frPct(c.rate)}${c.min ? `, plancher ${c.min} RMB` : ""}` +
    (schedule.perOrder ? ` ; plateforme ${schedule.perOrder} RMB par ordre` : "") +
    (schedule.buyChargeLabel ? ` ; ${schedule.buyChargeLabel}` : "") +
    ` ; frais de traitement ${frPct(levies.handling)}, CSRC ${frPct(levies.csrc)}, transfert ChinaClear ${frPct(levies.chinaClear)}, HKSCC ${frPct(levies.hkscc)}` +
    ` ; timbre ${frPct(stampRate)} à la vente${etfLike ? " (0 sur un ETF)" : ""}. Chaque sens.`;
  const shared = {
    ...answer,
    remark: [answer.remark, m.row.remark].filter(Boolean).join(" "),
    cashCurrency: converts ? "HKD" : "CNH",
    listing,
    lot: CN_LOT,
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: converts ? (fxEach == null ? null : fxEach * 2) : 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  const trade = tradeOf(shared, query, listing);
  if (trade.miss) return trade.miss;
  const { n, notional, notionalUsd } = trade;

  const round = schedule.round || "exact";
  const commission = Math.max(c.min || 0, cents(notional * c.rate));
  const perOrder = schedule.perOrder || 0;
  const lots = Math.ceil(n / CN_LOT - 1e-9);
  const buyCharge = schedule.buyCharge ? schedule.buyCharge({ shares: n, notional, lots }) || 0 : 0;
  const side =
    line(notional * levies.handling, round) +
    line(notional * levies.csrc, round) +
    line(notional * levies.chinaClear, round) +
    line(notional * levies.hkscc, round);
  const stamp = line(notional * stampRate, round);

  const brokerLocal = Number(((commission + perOrder) * 2 + buyCharge).toPrecision(12));
  const levyLocal = Number((side * 2).toPrecision(12));
  const brokerFees = dollars(brokerLocal, listing.currency);
  const levyUsd = dollars(levyLocal, listing.currency);
  const stampUsd = dollars(stamp, listing.currency);
  const bookUsd = bookUsdOf({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    currency: listing.currency,
    notionalUsd,
    n,
  });
  const fxUsd = fxEach == null ? null : notionalUsd * fxEach * 2;
  const usd = plus(bookUsd, brokerFees, levyUsd, stampUsd, fxUsd);
  const why = [
    converts && fxEach == null
      ? `CNH n'est pas une devise de dépôt : change au cours maison, que ${schedule.broker} ne publie pas, total inconnu`
      : null,
    bookUsd == null ? noBookWhy(m, listing) : null,
  ].filter(Boolean).join(" ; ");
  const minHit = c.min && notional * c.rate < c.min - 1e-9;
  const confidence = [
    basis,
    minHit ? `courtage au plancher (${cents(commission)} RMB par sens)` : `courtage ${cents(commission)} RMB par sens`,
    buyCharge ? `${cents(buyCharge)} RMB à l'achat (${lots} lot${lots > 1 ? "s" : ""} de ${CN_LOT})` : null,
    etfLike ? "ETF : pas de timbre, ni CSRC ni transfert ChinaClear" : `timbre ${cents(stamp)} RMB à la vente`,
    bookNote({ bp: marketBp, perShare: marketPerShare, m, listing }),
    converts
      ? fxEach == null
        ? "change forcé HKD → CNH au cours maison non publié"
        : `change forcé ${frPct(fxEach)} par sens`
      : "caisse en CNH, pas de change",
  ].filter(Boolean).join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: tradeBlock(trade, listing.currency),
    commission: {
      buy: cents(commission + perOrder + buyCharge),
      sell: cents(commission + perOrder),
      brokerage: cents(commission),
      perOrder: cents(perOrder),
      buyCharge: cents(buyCharge),
      currency: listing.currency,
      eachWay: true,
    },
    levy: { side: finite(side, 12), stamp: finite(stamp, 12), perSide: true, currency: listing.currency },
    parts: partsBlock(bookUsd, brokerFees, levyUsd, stampUsd, fxUsd),
    confidence,
  };
}

// ------------------------------------------------------------ command line

// `node brokers/<folder>/<folder>_cost.mjs <ticker|ISIN> [place] [devise]
// [--shares=n] [--price=p] [--plan=id]`; `--schedule` prints a markets
// schedule without its fee functions.
export function printCli(callerUrl, roundTrip, schedule = null) {
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
  if (schedule && process.argv.includes("--schedule")) {
    const { markets, catalogueUrl, ...rest } = schedule;
    console.log(JSON.stringify({ ...rest, markets: Object.keys(markets || {}) }, null, 2));
    return;
  }
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
