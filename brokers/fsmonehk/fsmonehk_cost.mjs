// What one round trip costs at FSMOne HK: buy n shares at price p,
// sell them back at once, in dollars. Stocks and ETFs on the places the
// fee schedule names. Funds, bonds and managed portfolios stay out.
//
// Re-read 2026-10-09 on the public fee schedule. There is no GST.
//
//   HKEX     processing 0. Exchange fees each way: trading 0.00565%,
//            SFC 0.0027%, AFRC 0.00015% (minimum 0.01 HKD), settlement
//            0.0042%. Stamp 0.1% each way, minimum 1 HKD, on a share.
//            An ETF pays no stamp.
//   US       processing 0.02%, minimum 3.80 USD, stocks and ETFs.
//            SEC 0.00206% on the sell, minimum 0.01 USD. CAT 0.000004 USD
//            a share each way, minimum 0.01 USD. The page prints the TAF
//            at 0 USD a share.
//   SSE/SZSE processing 0.08%, minimum 40 yuan, stocks and ETFs.
//            A share also pays handling 0.00341%, transfer 0.003% and
//            the securities fee 0.002% each way, and stamp 0.05% on the
//            sell. An ETF pays handling 0.004% and transfer 0.002% each
//            way, and no stamp.
//   SGX      processing 0.08%, minimum 8.80 in SGD, AUD, USD, EUR or GBP,
//            50 in CNH, CNY or HKD, 800 in JPY. Clearing 0.0325% and
//            trading 0.0075% each way, plus the settlement instruction
//            in the listing currency.
//
// Collecting a dividend and a corporate action are not this trip. A US
// line uses the Rule 606 mix of iFAST Securities US Corporation (CRD
// 327903). Hong Kong, China and Singapore keep their own book. UK stamp
// and FTT come from the tax map and are not added again.
//
//   https://www.fsmglobal.hk/stocks/explore/fee-schedule/hk-stock
//   https://www.fsmglobal.hk/stocks/explore/fee-schedule/us-stock
//   https://www.fsmglobal.hk/stocks/explore/fee-schedule/a-stock
//   https://www.fsmglobal.hk/stocks/explore/fee-schedule/sg-stock
//
//   node brokers/fsmonehk/fsmonehk_cost.mjs 1 HKEX HKD --shares=100 --price=50
//   node brokers/fsmonehk/fsmonehk_cost.mjs 2800 HKEX HKD --shares=100 --price=20
//   node brokers/fsmonehk/fsmonehk_cost.mjs AACG NASDAQ USD --shares=10 --price=2
//   node brokers/fsmonehk/fsmonehk_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("fsmonehk-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.fsmglobal.hk/support/fees-charges/fee-schedule",
  readOn: "2026-10-09",
  entity: "FSMOne HK",
  venue: "the exchange named on the line",
  rule606: "ifastsecuritiesus",
};

const US = new Set(["NYSE", "NASDAQ", "AMEX", "BATS"]);
const CHINA = new Set(["SSE", "SZSE"]);
const SGX_MIN = { SGD: 8.8, AUD: 8.8, USD: 8.8, EUR: 8.8, GBP: 8.8, CNH: 50, CNY: 50, HKD: 50, JPY: 800 };
const SGX_SI = { GBP: 0.23, EUR: 0.26, USD: 0.27, SGD: 0.35, CAD: 0.37, AUD: 0.42, CNH: 2, CNY: 2, HKD: 2.14, JPY: 41 };
const REMARK =
  "0.5% fees on Singapore and China A dividend.";
// 1 HKD = currency, bid then offer, cash-account board of 2026-10-09 09:16.
// Half the spread stays in the remark. The round trip does not pay it.
const FX_HOME = "HKD";
const FX_BOARD = {
  USD: [0.127064, 0.127755],
  EUR: [0.11291, 0.114206],
  AUD: [0.181858, 0.183728],
  CNY: [0.849645, 0.8584],
  CNH: [0.849645, 0.8584],
  SGD: [0.162397, 0.163877],
  JPY: [20.087796, 20.16533],
  GBP: [0.095895, 0.096573],
  CHF: [0.105418, 0.106377],
  CAD: [0.180334, 0.181971],
};

function fxRemark(currency) {
  const ccy = code(currency);
  if (!ccy || ccy === FX_HOME) return "";
  const pair = FX_BOARD[ccy];
  if (!pair) return "";
  const [bid, offer] = pair;
  const half = ((offer - bid) / (offer + bid)) * 100;
  return `FX ${half.toFixed(3)}% if cash ≠ ${ccy}.`;
}

function remarkOf(currency) {
  return [REMARK, fxRemark(currency)].filter(Boolean).join("\n");
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const pct = (notional, rate) => (notional * rate) / 100;
const atLeast = (amount, min) => (min > 0 ? Math.max(amount, min) : amount);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const want = place ? listingKey({ exchange: place, mic: place }) : {};
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function fundLike(type) {
  return type === "ETF" || type === "ETC" || type === "ETN";
}

function processingOne(listing, notional) {
  const exchange = listing.brokerExchange;
  if (exchange === "HKEX") return { amount: 0, currency: "HKD" };
  if (US.has(exchange)) return { amount: Math.max(3.8, pct(notional, 0.02)), currency: "USD" };
  if (CHINA.has(exchange)) {
    const currency = listing.currency === "CNY" ? "CNY" : "CNH";
    return { amount: Math.max(40, pct(notional, 0.08)), currency };
  }
  if (exchange === "SGX") {
    const min = SGX_MIN[listing.currency];
    if (min == null) return null;
    return { amount: Math.max(min, pct(notional, 0.08)), currency: listing.currency };
  }
  return null;
}

function exchangeFees(listing, notional, shares) {
  const exchange = listing.brokerExchange;
  const fund = fundLike(listing.type);
  const out = [];
  const add = (amount, currency) => {
    if (amount) out.push({ amount, currency });
  };
  if (exchange === "HKEX") {
    const afrc = atLeast(pct(notional, 0.00015), 0.01);
    const levies = pct(notional, 0.00565 + 0.0027 + 0.0042) + afrc;
    const stamp = fund ? 0 : atLeast(pct(notional, 0.1), 1);
    add((levies + stamp) * 2, "HKD");
    return out;
  }
  if (US.has(exchange)) {
    const cat = atLeast(shares * 0.000004, 0.01);
    const sec = atLeast(pct(notional, 0.00206), 0.01);
    add(cat * 2 + sec, "USD");
    return out;
  }
  if (CHINA.has(exchange)) {
    const currency = listing.currency === "CNY" ? "CNY" : "CNH";
    if (fund) add(pct(notional, 0.004 + 0.002) * 2, currency);
    else add(pct(notional, 0.00341 + 0.003 + 0.002) * 2 + pct(notional, 0.05), currency);
    return out;
  }
  if (exchange === "SGX") {
    const si = SGX_SI[listing.currency] || 0;
    add((pct(notional, 0.0325 + 0.0075) + si) * 2, listing.currency);
    return out;
  }
  return out;
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
    cashCurrency: "HKD",
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue FSMOne HK n'existe pas encore : lancer `node brokers/fsmonehk/fsmonehk_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue FSMOne HK` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez FSMOne HK`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "fsmonehk",
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
  const american = US.has(listing.brokerExchange) && listing.currency === "USD";
  const leaf = book.leaf;
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && bp == null && perShare == null && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "fsmonehk", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    remark: remarkOf(listing.currency),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème FSMOne HK, relu le ${SCHEDULE.readOn}`,
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
  const one = processingOne(listing, notional);
  if (!one) {
    return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème FSMOne HK` };
  }
  const processingUsd = dollars(one.amount * 2, one.currency);
  let exchangeUsd = 0;
  for (const fee of exchangeFees(listing, notional, n)) {
    const usd = dollars(fee.amount, fee.currency);
    if (usd == null) {
      exchangeUsd = null;
      break;
    }
    exchangeUsd += usd;
  }
  const ticketUsd = plus(processingUsd, exchangeUsd);
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, ticketUsd, taxUsd);
  const confidence = [
    shared.basis,
    fundLike(listing.type) ? "barème ETF" : "barème action",
    one.amount === 0 ? "courtage 0" : `${one.amount} ${one.currency} par sens`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? american
          ? `carnet ${marketPerShare} $ la part, mélange 606 d'iFAST Securities US`
          : `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(ticketUsd, 6),
    commission: { each: one.amount, currency: one.currency, eachWay: true },
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
      courtage: finite(processingUsd, 6),
      bourse: finite(exchangeUsd, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, gst: 0, hkProcessing: 0, us: "0.02% min 3.80 USD", china: "0.08% min 40", sgx: "0.08% with a currency floor" }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/fsmonehk/fsmonehk_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.bourse) console.log(`  bourse         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
