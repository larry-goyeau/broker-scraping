// What one round trip costs at Gotrade Indonesia: buy n shares at price p,
// sell them back at once, in dollars. Stocks and ETFs. Options, rights,
// transfers and the dividend charge stay out.
//
// Re-read 2026-10-09.
//   https://www.heygotrade.com/id/fee/
//
//   Trading fee     0.30% of the amount, minimum $0.10 a side. Prestige
//                   is 0.20% on the same minimum. Prestige needs $7,000
//                   in the account or $32,000 traded in 30 days, so the
//                   ticket uses the regular rate.
//                   https://help.heygotrade.com/id/articles/9776551-apa-syarat-dan-keuntungan-menjadi-gotrade-prestige
//   JFX             0.05% of the amount, at most $0.10 a side. Rounded
//                   to the nearest cent.
//   PPN             11% of the trading fee and the JFX fee, each side.
//                   Rounded to the nearest cent.
//   SEC             $0.0000206 of the amount, sell only. The worked
//                   example charges $0.01 when the raw fee is under a cent.
//   TAF             $0.000195 a share, sell only, cap $9.79. Same $0.01
//                   floor in the example.
//   CAT             $0.000003 a share, both ways. The buy example charges
//                   $0.01 on a fraction of a cent. The sell example prints
//                   $0.0000265; the schedule above it is $0.000003.
//   FX              A spread of 0.25% to 0.35% when rupiah is converted.
//                   A dollar deposit is free and stays dollars, so the
//                   range stays in the remark.
//   Dividend        15% of the dividend. Not this ticket.
//
// Gotrade Indonesia (PT Valbury Asia Futures) files no 606. The fee
// page names Alpaca Securities LLC for an option exercise, so a US
// line uses that firm's Q. The exercise itself stays off this ticket.
//
//   node brokers/gotradeid/gotradeid_cost.mjs AAPL US USD --shares=10 --price=230
//   node brokers/gotradeid/gotradeid_cost.mjs --schedule
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

const CATALOGUE = new URL("gotradeid-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.heygotrade.com/id/fee/",
  readOn: "2026-10-09",
  entity: "Gotrade Indonesia",
  rule606: "alpaca",
};

const FEE = 0.003;
const FEE_MIN = 0.1;
const JFX = 0.0005;
const JFX_CAP = 0.1;
const VAT = 0.11;
const SEC = 0.0000206;
const TAF = 0.000195;
const TAF_CAP = 9.79;
const CAT = 0.000003;
const REMARK = "Prestige is -0.1%, from $7,000 or $32,000 traded in 30 days.\nFX 0.25% to 0.35% when cash ≠ USD.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// The fee page rounds a charge to the nearest cent. The worked example
// still charges $0.01 when the raw regulatory fee is only a fraction of
// a cent.
function cents(amount) {
  return Math.round(amount * 100) / 100;
}

function centFloor(amount) {
  if (!(amount > 0)) return 0;
  return Math.max(0.01, cents(amount));
}

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

function side(notional, shares, sell) {
  const trading = cents(Math.max(notional * FEE, FEE_MIN));
  const exchange = cents(Math.min(notional * JFX, JFX_CAP));
  const vat = cents(VAT * (trading + exchange));
  const cat = centFloor(shares * CAT);
  if (!sell) return trading + exchange + vat + cat;
  const sec = centFloor(notional * SEC);
  const taf = Math.min(TAF_CAP, centFloor(shares * TAF));
  return trading + exchange + vat + cat + sec + taf;
}

function commission(notional) {
  return cents(Math.max(notional * FEE, FEE_MIN));
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
    cashCurrency: "USD",
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Gotrade Indonesia n'existe pas encore : lancer `node brokers/gotradeid/gotradeid_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Gotrade Indonesia` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Gotrade Indonesia`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "gotradeid",
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
  const quoted = usBookPerShare({ broker: "gotradeid", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  const marketBp = bp ?? null;
  const marketPerShare = perShare ?? quoted;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    remark: REMARK,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Gotrade Indonesia, relu le ${SCHEDULE.readOn} : 0,30 % min 0,10 $, JFX 0,05 % plafonné à 0,10 $, PPN 11 %`,
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
  const ticketUsd = side(notional, n, false) + side(notional, n, true);
  const courtage = commission(notional) * 2;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, ticketUsd, taxUsd);
  const confidence = [
    shared.basis,
    listing.type === "ETF" || listing.type === "ETN" || listing.type === "ETC" ? "barème ETF" : "barème action",
    "mélange 606 d'Alpaca Securities",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(ticketUsd, 6),
    commission: { each: FEE, minimum: FEE_MIN, currency: "USD", eachWay: true },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de 605 pour ce ticker"}` }
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
      courtage: finite(courtage, 6),
      bourse: finite(ticketUsd - courtage, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, fee: "0.30% min 0.10 USD", jfx: "0.05% cap 0.10 USD", vat: VAT, sec: SEC, taf: TAF, cat: CAT }, null, 2));
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/gotradeid/gotradeid_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse) console.log(`  bourse         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
