// What one round trip costs at Eco Valores: buy n shares at price p, sell
// them back at once, in dollars. Buenos Aires shares and CEDEARs. Funds,
// warrants, futures, bonds and options stay out. The Interactive Brokers
// account opened by invitation is not this ticket.
//
// Re-read 2026-10-11. The page prints no effective date. The figure is
// the self-directed book, both sides, with the sale on another day.
// Assisted trading is 0.75% and is not this ticket. The 2% ceiling is
// the regulatory cap, not a rate anyone is charged here.
//   https://www.ecovalores.com.ar/tarifario.php
//
//   Shares and CEDEARs   0.33% of the consideration, each side, plus IVA.
//   IVA                  The table says the rates exclude it and does not
//                        print the rate. A share or a CEDEAR takes the 21%
//                        rate those words mean.
//   Market rights        0.05% each side, plus IVA. The column prints the
//                        0.05% and the heading says the commission excludes
//                        it.
//   Same session         The smaller side's commission is waived when the
//                        sale is the same day, currency and settlement.
//                        An equal round trip pays half the commission.
//                        Rights stay. The figure stays at 0.33%. The waiver
//                        is the remark.
//   Club de los Millones 0.25% once 30,000,000 pesos trade on at least
//                        three days that week. The credit is the next
//                        Monday, so the figure stays at 0.33%. The gap is
//                        the remark.
//
// A peso line settles in pesos. A MEP line and a cable line settle in
// dollars, so the conversion stays out of the figure. The remark is half
// the published AL30 buy/sell when the cash is not that currency. A peso
// line and a MEP line use AL30 against AL30D. A cable line uses AL30
// against AL30C. Last point 2026-10-09 16:59 ART.
//   https://bonos.ecovalores.com.ar/
// A dividend, custody and a title transfer are not this order.
//
//   node brokers/ecovalores/ecovalores_cost.mjs GGAL BCBA ARS --shares=10 --price=8000
//   node brokers/ecovalores/ecovalores_cost.mjs AAPL BCBA ARS --shares=10 --price=27000
//   node brokers/ecovalores/ecovalores_cost.mjs AAPLD BCBA USD --shares=10 --price=18
//   node brokers/ecovalores/ecovalores_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("ecovalores-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.ecovalores.com.ar/tarifario.php",
  readOn: "2026-10-11",
  entity: "Eco Valores S.A.",
};

const IVA = 0.21;
const RATE = 0.0033;
const MARKET = 0.0005;
const REMARK = [
  "If the sale is the same day, the commission is half.",
  "Trading fees are 0.08% lower above 30,000,000 pesos traded on at least 3 days that week.",
].join("\n");
// Compra, venta. Pesos per 1 dollar. Last point of 2026-10-09 16:59 ART.
// Half the width, over the mid, is the remark.
const MEP = [1539.09, 1539.82];
const CCL = [1612.13, 1613.82];

function fxNote(currency, ticker) {
  const cable = currency === "USD" && String(ticker || "").endsWith("C");
  const [buy, sell] = cable ? CCL : MEP;
  const half = ((sell - buy) / (sell + buy)) * 100;
  return fxRemark(half.toFixed(3), currency);
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

const withIva = (amount) => amount * (1 + IVA);

function findListing({ etf, place, currency, ticker }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const wantTicker = loose(ticker);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  const exact = wantTicker
    ? matches.filter((m) => loose(m.row.ticker) === wantTicker || loose(m.row.query) === wantTicker)
    : [];
  return { named, matches: exact.length ? exact : matches };
}

export function roundTrip({ etf, place, currency, ticker = null, shares, price, bp = null, perShare = null }) {
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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Eco Valores n'existe pas encore : lancer `node brokers/ecovalores/ecovalores_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency, ticker });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Eco Valores` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Eco Valores`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
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
  const leaf = book.leaf;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
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
    basis: `tarif non assisté, relu le ${SCHEDULE.readOn} : 0,33 % + IVA par exécution ; droits 0,05 % + IVA`,
    tax,
    ccy: QUOTE,
    remark: [REMARK, fxNote(listing.currency, listing.ticker)].join("\n"),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commission = withIva(notional * RATE) * 2;
  const rights = withIva(notional * MARKET) * 2;
  const brokerFees = dollars(commission, listing.currency);
  const bourse = dollars(rights, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const confidence = [
    shared.basis,
    "cours internet",
    "ligne dans sa devise : pas de change",
    "vente un autre jour : les deux côtés au tarif plein",
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
    commission: { rate: RATE, vat: IVA, currency: listing.currency, eachWay: true },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
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
      bourse: finite(bourse, 6),
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
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, marketRights: MARKET, iva: IVA }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/ecovalores/ecovalores_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
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
    if (parts.bourse) console.log(`  marché         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
