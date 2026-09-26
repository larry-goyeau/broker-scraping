// Equity delivery round trip on NSE or BSE: buy the shares, sell them back.
// Each broker file passes the rates its own charges page prints. This file
// only adds those rates up. Intraday, F&O and a call-and-trade order are
// other tables.
//
// brokerFees is the broker's own bill: brokerage, the DP debit on the sell,
// and GST on those two. STT, stamp, the exchange, SEBI and GST on that
// pass-through sit in the total beside the book, the way a stamp does.
// A missing book stays missing.

import { rowsNamed, warmListingIndex } from "./listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "./venues.mjs";
import { plus, finite } from "./na.mjs";
import { QUOTE, toUsd } from "./fx.mjs";

const CRORE = 10_000_000;
const SPREADS = new URL("./parsed_json/spread.json", import.meta.url);

let spreadsCache;
function spreadsOf() {
  if (spreadsCache) return spreadsCache;
  spreadsCache = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};
  return spreadsCache;
}

export function sebiRate() {
  return 10 / CRORE;
}

export function pct(text) {
  return Number(text) / 100;
}

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function paise(amount) {
  return Math.round(amount * 100) / 100;
}

// A direct mutual fund is not an exchange order. An InvIT, a REIT and a
// bond are not the equity-delivery table.
export function productOf(row) {
  const isin = code(row?.isin);
  const name = `${row?.name || ""} ${row?.ticker || ""}`;
  if (code(row?.exchange) === "COIN" || code(row?.type) === "FUND") return "fund";
  if (/\bINVIT\b|\bREIT\b|INFRASTRUCTURE TRUST|REAL ESTATE/i.test(name)) return "other";
  if (/^IN\d/.test(isin)) return "other";
  if (/^INE/.test(isin) && !/^INE.{4}01/.test(isin)) return "other";
  return "equity";
}

function findListing(rows, { etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    const root = String(r.ticker || "").toUpperCase().replace(/-(EQ|BE|BZ|SM|ST|IV|RR|A|B)$/, "");
    return loose(root) === asked;
  });
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function loadRows(catalogueUrl) {
  if (!fs.existsSync(catalogueUrl)) return null;
  const catalogue = JSON.parse(fs.readFileSync(catalogueUrl, "utf8"));
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  warmListingIndex(rows);
  return rows;
}

export function indiaRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "INR",
    url: schedule.url,
    remark: schedule.remark,
  };
  const rows = loadRows(schedule.catalogueUrl);
  if (!rows) {
    return { ...answer, why: `le catalogue ${schedule.broker} n'existe pas encore : lancer \`node ${schedule.folder}/${schedule.folder}_scraping.mjs\`` };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${schedule.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${schedule.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const leafBook = spreadLeaf(spreadsOf(), {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: schedule.folder,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type),
    mic: leafBook.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const kind = productOf(m.row);
  const shared = { ...answer, listing };
  if (typeof schedule.us === "function" && ["NASDAQ", "NYSE", "AMEX", "CBOE"].includes(code(listing.brokerExchange))) {
    return schedule.us({ listing, leafBook, row: m.row, shared, query });
  }
  if (kind === "fund" && schedule.freeFund) {
    return {
      ...shared,
      brokerFees: 0,
      basis: `fonds direct, page relue le ${schedule.readOn} : 0 commission et 0 DP`,
      why: "pas de carnet pour un fonds hors bourse",
    };
  }
  if (kind !== "equity") {
    return { ...shared, why: `${listing.ticker || listing.isin} n'est pas au barème action et ETF` };
  }
  if (code(listing.currency) !== "INR" || !["NSE", "BSE"].includes(code(listing.brokerExchange))) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas au barème cash NSE/BSE` };
  }

  const n = Number(shares);
  const p = Number(price);
  const basis = `livraison NSE/BSE, page relue le ${schedule.readOn}. ${schedule.basis}`;
  if (!(n > 0)) return { ...shared, basis, why: "aucun nombre de parts" };
  const priced = p > 0;
  // A flat brokerage (Zerodha, Dhan, Shoonya: ₹0) plus the DP debit does not
  // need a last price. A percent of notional does, and stays N/A without one.
  // The book is never an input of this bill.
  let flatEach = null;
  if (!priced) {
    const low = schedule.brokerageEach(0);
    const high = schedule.brokerageEach(1e12);
    if (low === high && Number.isFinite(low)) flatEach = low;
    else return { ...shared, basis, why: "aucun prix pour cette ligne : lancer node prices.mjs" };
  }

  const notional = priced ? n * p : 0;
  const txnRate = schedule.txnRate(code(listing.brokerExchange));
  if (txnRate == null) {
    return { ...shared, basis, why: `${listing.brokerExchange} n'a pas de taux de transaction publié pour cette ligne` };
  }
  const brokerageEach = priced ? schedule.brokerageEach(notional) : flatEach;
  const brokerage = brokerageEach * 2;
  const sides = schedule.sttSides ? schedule.sttSides(m.row) : 2;
  const ipftRate = typeof schedule.ipftRate === "function" ? schedule.ipftRate(code(listing.brokerExchange)) : schedule.ipftRate || 0;
  if (ipftRate == null) {
    return { ...shared, basis, why: `${listing.brokerExchange} n'a pas de taux IPFT publié pour cette ligne` };
  }
  let stt = notional * schedule.sttRate * sides;
  let stamp = notional * schedule.stampRate;
  let txn = notional * txnRate * 2;
  let sebi = notional * schedule.sebiRate * 2;
  let ipft = notional * ipftRate * 2;
  const dpBase = schedule.dpInr || 0;
  if (schedule.roundRupee) {
    stt = Math.round(stt);
    stamp = Math.round(stamp);
    txn = paise(txn);
    sebi = paise(sebi);
    ipft = paise(ipft);
  }
  const gstBroker = schedule.gstRate * brokerage;
  const gstDp = schedule.dpIncludesGst || !schedule.gstOnDp ? 0 : schedule.gstRate * dpBase;
  const gstLevy =
    schedule.gstRate *
    (txn + (schedule.gstOnSebi === false ? 0 : sebi) + (schedule.gstOnIpft ? ipft : 0));
  const dpBill = schedule.dpIncludesGst ? dpBase : dpBase + gstDp;
  const brokerRaw = brokerage + gstBroker + dpBill;
  const brokerInr = schedule.roundRupee ? paise(brokerRaw) : brokerRaw;
  const levyRaw = stt + stamp + txn + sebi + ipft + gstLevy;
  const levyInr = schedule.roundRupee ? paise(levyRaw) : levyRaw;
  const brokerFees = dollars(brokerInr, "INR");
  const levyUsd = dollars(levyInr, "INR");
  const notionalUsd = dollars(notional, "INR");
  const leaf = leafBook.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;
  const usd = priced ? plus(bookUsd, brokerFees, levyUsd) : null;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    basis,
    ...(!priced
      ? { why: "aucun prix pour cette ligne : lancer node prices.mjs" }
      : bookUsd == null
        ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de source de spread"}` }
        : {}),
    trade: { shares: n, price: priced ? p : null, notional, notionalUsd: finite(notionalUsd, 6), currency: "INR" },
    commission: { each: brokerageEach, dp: dpBase, currency: "INR" },
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
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  });
  console.log(JSON.stringify(out, null, 2));
}
