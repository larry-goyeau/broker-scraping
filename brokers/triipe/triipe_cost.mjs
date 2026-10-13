// What one round trip costs at Trii Peru: buy n shares at price p, sell
// them back at once, in dollars. Lima shares and the US shares and ETFs.
// Mutual funds stay out. The Bogotá list is Trii Colombia, and the Peru
// FAQ says an order cannot cross from one app to the other.
//
// Re-read 2026-10-10. The app schedule, and Kallpa's form for the Trii
// app (form 2, in force from 15 Aug 2024; the file's later pages are
// the firm's own book):
//   https://trii.pe/
//   https://trii.pe/faq
//   http://kallpasab.com/document/tarifario.pdf
//
//   Soles, up to S/ 2,000      S/ 12.50 each execution
//   Soles, above that          0.60% each execution
//   Dollars, up to $500        $3 each execution
//   Dollars, above that        0.60% each execution
//   The flat fees are all-in: BVL, CAVALI, the SMV and IGV are inside
//   them. The 0.60% line names no further levy. A same-day sale is the
//   same rate. A client who was already at Kallpa pays form 1 above
//   the threshold. That client is not this one. Prometeo is optional.
//
// Kallpa sends the order. No US broker-dealer is named, so a US line
// is the national quote. Cash can stay in soles or in dollars.
//
//   node brokers/triipe/triipe_cost.mjs AAPL US USD --shares=10 --price=230
//   node brokers/triipe/triipe_cost.mjs CREDITC1 BVL PEN --shares=100 --price=10
//   node brokers/triipe/triipe_cost.mjs SPY US USD --shares=10 --price=500
//   node brokers/triipe/triipe_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("triipe-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://trii.pe/",
  faq: "https://trii.pe/faq",
  kallpa: "http://kallpasab.com/document/tarifario.pdf",
  readOn: "2026-10-10",
  entity: "Kallpa Securities SAB",
};

const RATE = 0.006;
const PEN_FLAT = 12.5;
const PEN_UP_TO = 2000;
const USD_FLAT = 3;
const USD_UP_TO = 500;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// One execution, in the currency of the trade.
export function execution(notional, currency) {
  const coin = code(currency);
  if (coin === "PEN") return notional <= PEN_UP_TO ? PEN_FLAT : notional * RATE;
  if (coin === "USD") return notional <= USD_UP_TO ? USD_FLAT : notional * RATE;
  return null;
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Trii n'existe pas encore : lancer `node brokers/triipe/triipe_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Trii` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Trii`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "triipe",
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
  const american = listing.brokerExchange === "US";
  const quoted = american
    ? usBookPerShare({ broker: "triipe", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null })
    : null;
  const marketPerShare = perShare ?? quoted ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null && american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    url: SCHEDULE.url,
    basis: `barème Trii relu le ${SCHEDULE.readOn} : 0,60 % par exécution, ou S/ 12,50 et 3 $ en dessous du seuil`,
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
  const one = execution(notional, listing.currency);
  if (one == null) return { ...shared, why: `${listing.ticker} est coté en ${listing.currency} : le barème ne nomme pas cette devise` };
  const commission = one * 2;
  const brokerFees = dollars(commission, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    one === (listing.currency === "PEN" ? PEN_FLAT : USD_FLAT) ? "au forfait, tout compris" : "au pourcentage",
    american ? "cours national" : "place BVL",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      rate: RATE,
      flat: listing.currency === "PEN" ? PEN_FLAT : USD_FLAT,
      upTo: listing.currency === "PEN" ? PEN_UP_TO : USD_UP_TO,
      each: one,
      currency: listing.currency,
      eachWay: true,
    },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de carnet pour ce ticker"}` }
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
      courtage: finite(brokerFees, 6),
      bourse: finite(0, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
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
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, penFlat: PEN_FLAT, penUpTo: PEN_UP_TO, usdFlat: USD_FLAT, usdUpTo: USD_UP_TO }, null, 2));
    return;
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/triipe/triipe_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
