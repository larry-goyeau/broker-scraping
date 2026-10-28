// What one round trip costs at BISON (EUWAX AG, Börse Stuttgart group; depot
// at Sutor Bank, "WP-BISON" service): buy n shares at price p on
// TradeREBEL, sell them back at once, in the app, in dollars.
//
// Read 2026-10-26:
//   Gebühren page: https://bisonapp.com/gebuehren/
//     "Du bezahlst nur eine feste Gebühr von 1,99 Euro pro Kauf oder
//     Verkauf beim Handel mit Wertpapieren." "Die Höhe des Trades
//     (Handels) ist egal." Depotführung and euro deposits / withdrawals:
//     "Kostenlos".
//   Sutor Bank's Preis- und Leistungsverzeichnis for WP-BISON (Feb 2026,
//   as read for ./bison_scraping.mjs): Finanzkommissionsentgelt 1,30 Euro
//   + Übermittlungsentgelt EUWAX 0,69 Euro = the same 1,99 Euro.
//   Place: TradeREBEL only ("ausschließlich am Handelsplatz TradeRebel"),
//   quote-driven with EUWAX as the one liquidity provider; no exchange fee
//   is printed on top of the 1.99 €, so the spread is the venue's quote.
//
// Formula: 2 × 1.99 € + market book (spreads/book.mjs; TradeREBEL has no
// book leaf yet, so the total stays unknown until one exists) + buy-side
// FTT from taxMap.mjs (French, Italian, Spanish shares).
// Cash is euro only and every catalogue line is in EUR: no FX.
// Left out: Instant SEPA charges of the client's own bank, crypto side,
// savings plans, partial fills.
//
//   node brokers/bison/bison_cost.mjs DE0007164600 TradeREBEL EUR --shares=5 --price=200
//   node brokers/bison/bison_cost.mjs FR0000121014 TradeREBEL EUR --shares=2 --price=500
//   node brokers/bison/bison_cost.mjs IE00B4L5Y983 TradeREBEL EUR --shares=10 --price=100
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const FOLDER = "bison";
const CATALOGUE = new URL("bison-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://bisonapp.com/gebuehren/",
  readOn: "2026-10-26",
  entity: "EUWAX AG (BISON), Sutor Bank AG",
};

const FLAT_EUR = 1.99;
const PLACES = { TRADEREBEL: { label: "TradeREBEL" } };

const euro = (x) => x.toFixed(2).replace(".", ",");

export function commissionEur(notionalEur) {
  return notionalEur > 0 ? FLAT_EUR : 0;
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || code(m.row.mic) === code(place))
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan,
    onlineBuy: true,
    cashCurrency: "EUR",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue BISON n'existe pas encore : lancer `node brokers/bison/bison_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BISON` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BISON`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
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
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const where = PLACES[loose(listing.brokerExchange)] || null;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `page Gebühren BISON relue le ${SCHEDULE.readOn} : 1,99 € fixes par achat ou par vente, quel que soit le montant ` +
      `(PLV Sutor Bank : Finanzkommissionsentgelt 1,30 € + Übermittlungsentgelt EUWAX 0,69 €) ; place unique TradeREBEL, ` +
      `sans frais de bourse imprimés en plus`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), eur: usdPer("EUR") },
  };

  if (!where) return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas une place de BISON` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }
  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const trade = { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency };
  if (listing.currency !== "EUR") {
    return {
      ...shared,
      trade,
      why: `BISON ne tient que des euros et TradeREBEL cote en euro : une ligne en ${listing.currency} n'est pas au barème`,
    };
  }

  const each = commissionEur(notional);
  const brokerFees = dollars(each * 2, "EUR");
  const bookUsd = parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const confidence = [
    shared.basis,
    `${euro(each)} € par ordre, aller et retour`,
    taxTotal > 0 ? `taxe ${(100 * taxTotal).toFixed(3)} % à l'achat (taxMap)` : null,
    gap ? `${gap} : total inconnu` : null,
    marketPerShare != null ? `carnet ${marketPerShare} $ la part` : marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  const why = [
    gap || null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null && why.length ? { why: why.join(" ; ") } : {}),
    commission: { flat: FLAT_EUR, each, currency: "EUR", eachWay: true },
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/bison/bison_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
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
    if (out.alternatives) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip    : ${out.usd == null ? "unknown" : `${out.usd} $`}`);
    console.log(`broker fees   : ${out.brokerFees == null ? "unknown" : `${out.brokerFees} $`}`);
    if (out.parts) for (const [k, v] of Object.entries(out.parts)) console.log(`  ${k.padEnd(12)}: ${v == null ? "unknown" : `${v} $`}`);
  }
  if (out.why) console.log(`\n${out.why}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
