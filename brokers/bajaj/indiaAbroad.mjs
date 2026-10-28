// Shared pieces of the cost files of the Indian brokers whose catalogue is
// ./indiaBook.mjs plus a foreign book (Bajaj Broking, Bonanza, Geojit, JM
// Financial, Lakshmishree, SBI Securities, SMC Global). Each cost file keeps
// its own tariff; this file only holds what is the same for all of them.
//
// BSE transaction charge by scrip group, BSE's own table (notice
// 20221109-7, bseindia.com/static/members/TFEquity.aspx, as reprinted by
// ../upstox/upstox_cost.mjs on 2026-10-18 and, for the non-exclusive list,
// by BlinkX's and Bigul's charges pages), per crore of gross turnover:
//   A, B                                  ₹375
//   E, F, FC, G, GC, I, W, T              ₹375 when the scrip also trades on
//                                         the NSE (an NSE line with the same
//                                         ISIN in the catalogue), else ₹275
//   M, MT, TS, MS, IF, IT, R              ₹275
//   X, XC, XD, XT, Z                      ₹10,000
//   P, ZP, SS, ST                         ₹1,00,000
// Any other group has no rate: the line answers with a `why`.
//
// usRoundTrip: a foreign line (US exchanges, OTC Markets) priced from the
// tariff the cost file hands in. Commission each side (plus GST when the
// page names it), the regulatory lines the page prints, the book (the
// 605 × Q of the US dealer the broker names, else the quoted NBBO; the
// OTC book is its own), a tax-map tax. A listing currency outside the
// folder's cash (deposits.mjs) is a forced conversion: with no published
// rate the total is N/A and `brokerFees` stays.
//
//   import { bseTxnRate, usRoundTrip, catalogueRows } from "../bajaj/indiaAbroad.mjs";

import fs from "node:fs";
import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CRORE = 1e7;
const BSE_PER_CRORE = {
  A: 375, B: 375,
  M: 275, MT: 275, TS: 275, MS: 275, IF: 275, IT: 275, R: 275,
  X: 10000, XC: 10000, XD: 10000, XT: 10000, Z: 10000,
  P: 100000, ZP: 100000, SS: 100000, ST: 100000,
};
const BSE_SHARED = new Set(["E", "F", "FC", "G", "GC", "I", "W", "T"]);

export const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One parse per catalogue, kept for the life of the process.
const loaded = new Map();
export function catalogueRows(catalogueUrl) {
  const key = String(catalogueUrl);
  if (loaded.has(key)) return loaded.get(key);
  let rows = null;
  if (fs.existsSync(catalogueUrl)) {
    const parsed = JSON.parse(fs.readFileSync(catalogueUrl, "utf8"));
    rows = Array.isArray(parsed) ? parsed : parsed?.rows || [];
    warmListingIndex(rows);
    rows.nse = new Set(rows.filter((r) => r.exchange === "NSE" && r.isin).map((r) => code(r.isin)));
  }
  loaded.set(key, rows);
  return rows;
}

// "… BSE <group> <ISIN> <type>" on a BSE catalogue line.
export function bseGroup(row) {
  const hit = String(row?.raw || "").match(/\bBSE\s+([A-Z]{1,2})\s+[A-Z]{2}[A-Z0-9]{9}\d\b/);
  return hit ? hit[1] : null;
}

// BSE's table. `rows` is the catalogue (for the NSE twin of a shared group).
export function bseTxnRate(row, rows) {
  const group = bseGroup(row);
  if (BSE_PER_CRORE[group] != null) return BSE_PER_CRORE[group] / CRORE;
  if (BSE_SHARED.has(group)) return (rows?.nse?.has(code(row?.isin)) ? 375 : 275) / CRORE;
  return null;
}

export const BSE_TABLE_BASIS =
  "BSE : frais de transaction selon le groupe, barème de la BSE (A, B 0,00375 % ; E, F, FC, G, GC, I, W, T 0,00375 % si aussi coté sur NSE, sinon 0,00275 % ; M, MT, TS, MS, IF, IT, R 0,00275 % ; X, XT, Z 0,1 % ; P, ZP, SS, ST 1 %).";

// The rows of the catalogue a query names, India or abroad.
export function findListing(rows, { etf, place, currency }, keep = () => true) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exact = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace && keep(r)) : [];
  const pool = exact.length ? exact : named.filter(keep);
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || exact.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export const isIndian = (row) => ["NSE", "BSE"].includes(code(row?.exchange));

// Which side of the file a query goes to: India when it names NSE, BSE or
// rupees, abroad when it names anything else, else the first catalogue line.
export function goesToIndia(rows, query) {
  const place = code(query.place);
  const ccy = code(query.currency);
  if (place === "NSE" || place === "BSE" || ccy === "INR") return true;
  if (place || ccy) return false;
  const asked = loose(query.etf);
  const first = rows ? rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked)[0] : null;
  return !first || isIndian(first);
}

/**
 * A foreign line at one of these brokers.
 *
 * tariff: {
 *   broker, folder, catalogueUrl, url, readOn,
 *   dealer: 606 key of the US broker-dealer the broker names, or null,
 *   commissionEach({ notional, shares, row }) → USD each side, before GST,
 *       or null when the page prints no price for that line,
 *   gst: rate on the commission (0 when the page names none),
 *   sec, tafPerShare, tafCap, catPerShare, ifsca (rates; 0 when not printed),
 *   fxSpread:  a forced conversion's cost each way (fraction of the notional),
 *              charged on the buy and on the sale; else
 *   fxUnknown: why-text when the cash is not the listing currency and no rate
 *       is published (null when the conversion is not forced),
 *   basis, remark(ctx) → English remark,
 *   noTariff: why-text when the line has no published price at all.
 * }
 */
export function usRoundTrip(tariff, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: depositHas(tariff.folder, "", currency) ? code(currency) : "INR",
    url: tariff.url,
    remark: "",
  };
  const rows = catalogueRows(tariff.catalogueUrl);
  if (!rows) {
    return { ...answer, why: `le catalogue ${tariff.broker} n'existe pas encore : lancer \`node brokers/${tariff.folder}/${tariff.folder}_scraping.mjs\`` };
  }
  const { named, matches } = findListing(rows, query, (r) => !isIndian(r));
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${tariff.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${tariff.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }
  const m = matches[0];
  const leafBook = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: tariff.dealer || tariff.folder,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: leafBook.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const forced = !depositHas(tariff.folder, "", listing.currency);
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const q = tariff.dealer ? qOf(tariff.dealer) : null;
  const shared = {
    ...answer,
    cashCurrency: forced ? "INR" : listing.currency,
    listing,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    basis: `${tariff.basis}${q != null ? ` Carnet 605 × Q ${tariff.dealerName || tariff.dealer} ${Number(q.toFixed(3))}.` : ""}`,
  };
  if (tariff.noTariff) return { ...shared, why: tariff.noTariff(listing) };
  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = tariff.commissionEach({ notional: notionalUsd, shares: n, row: m.row, listing });
  if (each == null) return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'a pas de tarif publié chez ${tariff.broker}` };
  const commission = each * 2;
  const gst = commission * (tariff.gst || 0);
  const brokerFees = commission + gst;
  const sec = notionalUsd * (tariff.sec || 0);
  const taf = Math.min(tariff.tafCap ?? Infinity, n * (tariff.tafPerShare || 0));
  const cat = n * (tariff.catPerShare || 0) * 2;
  const ifsca = notionalUsd * (tariff.ifsca || 0) * 2;
  const levy = sec + taf + cat + ifsca;
  const taxUsd = notionalUsd * taxTotal;

  const us605 = m.venue?.source === "us605";
  const routed = us605 ? usBookPerShare({ broker: tariff.dealer || tariff.folder, ticker: listing.ticker, fallback: leafBook.leaf?.perShare ?? null }) : null;
  const marketBp = bp ?? (routed != null ? null : leafBook.leaf?.bp ?? null);
  const marketPerShare = perShare ?? routed ?? leafBook.leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: routed != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd = parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const fxUsd = !forced ? 0 : tariff.fxSpread != null ? notionalUsd * tariff.fxSpread * 2 : null;
  const fxUnknown = fxUsd == null ? tariff.fxUnknown || "change forcé sans taux publié" : null;
  const usd = plus(bookUsd, brokerFees, levy, gap ? null : taxUsd, fxUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    fxUnknown,
    gap,
  ].filter(Boolean);
  const ctx = { notionalUsd, each, commission, gst, shares: n, listing, row: m.row };

  return {
    ...shared,
    remark: tariff.remark ? tariff.remark(ctx) : "",
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      each: finite(each, 6),
      gst: tariff.gst || 0,
      sec: finite(sec, 6),
      taf: finite(taf, 6),
      cat: finite(cat, 8),
      ifsca: finite(ifsca, 6),
      currency: "USD",
    },
    parts: {
      market: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      levies: finite(levy, 6),
      taxes: finite(taxUsd, 6),
      fx: finite(fxUsd, 6),
    },
  };
}

// A plan that prices one market only: the other market's lines are not that
// plan's row (the front shows them under the plan that prices them).
export function notThisPlan(answer, why) {
  return { ...answer, usd: null, brokerFees: null, onlineBuy: false, why };
}

export function cliArgs() {
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  return { etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")), plan: arg("plan", undefined) };
}
