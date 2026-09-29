// What one round trip costs at FSMOne Singapore: buy n shares at price p,
// sell them back at once, in dollars. Stocks and ETFs on the places the
// selector displays. Funds, bonds, managed portfolios and the ETF regular
// savings plan stays out. Gold and Diamond pay a flat 50 HKD on an HKEX
// share once 0.08% would exceed that. Gold starts at 200,000 SGD of
// assets and Diamond, above 500,000 SGD, pays the same flat fee.
//
// Re-read 2026-09-28 from the public fee call
// /sg/rest/stock/get-stock-fee-details. The pricing page quotes those
// processing fees before GST. A Singapore tax resident pays 9% on the
// processing fee, and on the SGX exchange fees the record marks gst.
//
//   SGX      stock 8.80 SGD, ETF 3.80 SGD, each way
//   US       stock 0.08% min 3.80 USD, ETF 3.80 USD, each way
//   HKEX     stock 0.08% min 50 HKD, or 50 HKD flat for Gold and Diamond
//            ETF 38 HKD, each way
//   LSE      0.15%, min 15 in the listing currency, or min 20 USD on a USD ETF
//   Bursa    0.08% min 8.80 MYR
//   SSE/SZSE 0.08% min 40 CNH
//
// Exchange fees below are the same call. A percent there is the figure
// they store (0.0075 means 0.0075%). UK stamp from the tax map is not
// added a second time. The fee call has no FX markup.
//
// US lines use the Rule 606 mix of iFAST Securities US Corporation, the
// group's US broker-dealer (CRD 327903). SGX, Hong Kong, China and Bursa
// have no free book.
//
//   https://fsm.global/sg/pricing-structure
//   https://fsm.global/sg/rest/stock/get-stock-fee-details
//
//   node FSMOne/FSMOne_cost.mjs ES3 SGX SGD --shares=100 --price=4
//   node FSMOne/FSMOne_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node FSMOne/FSMOne_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../venues.mjs";
import { usBookPerShare } from "../rule606.mjs";
import { bookParts, plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("FSMOne-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  url: "https://fsm.global/sg/pricing-structure",
  fees: "https://fsm.global/sg/rest/stock/get-stock-fee-details",
  readOn: "2026-09-28",
  entity: "FSMOne Singapore",
  venue: "the exchange named on the line",
  rule606: "ifastsecuritiesus",
};

const GST = 1.09;
const US = new Set(["NYSE", "NASDAQ", "AMEX", "BATS"]);
const CASH = new Set(["SGD", "USD", "AUD", "CAD", "EUR", "GBP", "CNH", "HKD", "NZD", "JPY", "CHF", "MYR"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

// The page has no ISIN. The front asks by the instrument's ISIN, so a code
// that the CSV ties to exactly one ISIN on that exchange answers for it.
const rowsByIsin = new Map();
{
  const codes = new Map();
  for (const name of ["stocks.csv", "etfs.csv"]) {
    const file = new URL(`../${name}`, import.meta.url);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n").slice(1)) {
      const ticker = line.slice(0, line.indexOf(","));
      const rest = line.slice(ticker.length + 1);
      const exchange = rest.slice(0, rest.indexOf(","));
      const isin = rest.slice(exchange.length + 1).split(",")[0].trim().toUpperCase();
      const code = ticker.split(":").pop().trim().toUpperCase();
      const place = exchange.trim().toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      const key = `${place}|${code}`;
      if (!codes.has(key)) codes.set(key, new Set());
      codes.get(key).add(isin);
    }
  }
  for (const row of rows) {
    const hit = codes.get(`${String(row.exchange || "").trim().toUpperCase()}|${String(row.ticker || "").trim().toUpperCase()}`);
    if (hit?.size !== 1) continue;
    const isin = [...hit][0];
    const list = rowsByIsin.get(isin) || [];
    list.push(row);
    rowsByIsin.set(isin, list);
  }
}
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const pct = (notional, rate) => (notional * rate) / 100;
const capped = (amount, max) => (max > 0 ? Math.min(amount, max) : amount);
const atLeast = (amount, min) => (min > 0 ? Math.max(amount, min) : amount);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const byName = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const named = byName.length ? byName : rowsByIsin.get(asked) || [];
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

// One side, before GST, in the currency the fee record uses.
function processingOne(listing, notional, plan) {
  const exchange = listing.brokerExchange;
  const fund = fundLike(listing.type);
  if (exchange === "SGX") return { amount: fund ? 3.8 : 8.8, currency: "SGD" };
  if (US.has(exchange)) return { amount: fund ? 3.8 : Math.max(3.8, pct(notional, 0.08)), currency: "USD" };
  if (exchange === "HKEX") {
    if (fund) return { amount: 38, currency: "HKD" };
    if (plan === "gold") return { amount: 50, currency: "HKD" };
    return { amount: Math.max(50, pct(notional, 0.08)), currency: "HKD" };
  }
  if (exchange === "LSE") {
    const min = fund && listing.currency === "USD" ? 20 : 15;
    return { amount: Math.max(min, pct(notional, 0.15)), currency: listing.currency };
  }
  if (exchange === "BURSA") return { amount: Math.max(8.8, pct(notional, 0.08)), currency: "MYR" };
  if (exchange === "SSE" || exchange === "SZSE") return { amount: Math.max(40, pct(notional, 0.08)), currency: "CNH" };
  return null;
}

function eachSide(amount) {
  return amount * 2;
}

// Exchange fees for the whole round trip, before the SGX GST.
function exchangeFees(listing, notional, shares) {
  const exchange = listing.brokerExchange;
  const fund = fundLike(listing.type);
  const out = [];
  const add = (amount, currency) => {
    if (amount) out.push({ amount, currency });
  };
  if (exchange === "SGX") {
    const trading = pct(notional, 0.0075);
    const clearing = pct(notional, 0.0325);
    const si = 0.7;
    add(eachSide(trading + clearing + si) * GST, "SGD");
    return out;
  }
  if (US.has(exchange)) {
    const cat = atLeast(shares * 0.000004, 0.01);
    const taf = capped(atLeast(shares * 0.000195, 0.01), 9.79);
    const sec = atLeast(pct(notional, 0.00206), 0.01);
    add(eachSide(cat) + taf + sec, "USD");
    return out;
  }
  if (exchange === "HKEX") {
    const levies = pct(notional, 0.00015 + 0.0042 + 0.00565 + 0.0027);
    const stamp = fund ? 0 : pct(notional, 0.1);
    add(eachSide(levies + stamp), "HKD");
    return out;
  }
  if (exchange === "BURSA") {
    if (fund) add(eachSide(capped(pct(notional, 0.0324), 1080)), "MYR");
    else {
      add(eachSide(capped(pct(notional, 0.03), 1000)), "MYR");
      add(eachSide(capped(Math.floor(notional / 1000) * 1, 1000)), "MYR");
    }
    return out;
  }
  if (exchange === "SSE" || exchange === "SZSE") {
    if (fund) add(eachSide(pct(notional, 0.004 + 0.002)), "CNH");
    else add(eachSide(pct(notional, 0.00341 + 0.003 + 0.002)) + pct(notional, 0.05), "CNH");
    return out;
  }
  if (exchange === "LSE" && !fund) {
    if (listing.currency === "GBP") {
      const ptm = capped(Math.floor(notional / 10000) * 1.5, 1.5);
      add(eachSide(ptm), "GBP");
    }
    return out;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = "standard" }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "SGD",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue FSMOne n'existe pas encore : lancer `node FSMOne/FSMOne_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue FSMOne` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez FSMOne`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "fsmone",
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
    const quoted = usBookPerShare({ broker: "fsmone", ticker: listing.ticker });
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
    cashCurrency: CASH.has(listing.currency) ? listing.currency : "SGD",
    listing,
    remark: "",
    url: SCHEDULE.url,
    basis: `barème FSMOne, relu le ${SCHEDULE.readOn} : frais de traitement hors GST, puis 9 %`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const one = processingOne(listing, notional, plan);
  const goldRemark =
    plan === "gold" && listing.brokerExchange === "HKEX" && !fundLike(listing.type) && pct(notional, 0.08) > 50
      ? "If ≥ 200,000 SGD portfolio value"
      : "";
  if (!one) {
    return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème FSMOne` };
  }
  const processingUsd = dollars(one.amount * 2 * GST, one.currency);
  let exchangeUsd = 0;
  for (const fee of exchangeFees(listing, notional, n)) {
    const usd = dollars(fee.amount, fee.currency);
    if (usd == null) {
      exchangeUsd = null;
      break;
    }
    exchangeUsd += usd;
  }
  const lseStock = listing.brokerExchange === "LSE" && !fundLike(listing.type);
  const stampLocal = lseStock && !(taxTotal > 0) ? pct(notional, 0.5) : 0;
  const stampUsd = stampLocal ? dollars(stampLocal, listing.currency) : 0;
  const ticketUsd = plus(processingUsd, exchangeUsd, stampUsd);
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
    "hors plan d'épargne ETF",
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
    remark: goldRemark,
    commission: { each: one.amount, currency: one.currency, eachWay: true, gst: 0.09 },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: american
            ? `pas de carnet 605 pour ${listing.ticker || etf}`
            : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
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
      bourse: finite(plus(exchangeUsd, stampUsd), 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, gst: "9% on the processing fee, and on SGX exchange fees", cash: "SGD" }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node FSMOne/FSMOne_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
