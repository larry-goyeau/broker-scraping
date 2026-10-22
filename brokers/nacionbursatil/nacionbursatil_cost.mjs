// What one round trip costs at Nación Bursátil: buy n shares at price p,
// sell them back at once, in dollars. Buenos Aires shares and CEDEARs (ETF
// certificates included), in pesos, MEP dollars (D lines) or cable dollars
// (C lines), ordered on its Home Broker. Bonds, cauciones, options, futures
// and orders abroad stay out.
//
// Read on 2026-10-21. "Tabla de Aranceles y Comisiones", approved by the
// board on 9 April 2025 (Acta de Directorio N° 628), the sheet the site
// links.
//   https://nacionbursatil.com.ar/assets/pdf/Tabla-de-Aranceles-y-Comisiones-2025_aprobados-Directorio-09-04-2025.pdf
//
//   Shares and CEDEARs   "Compra / Venta de Acciones y CEDEARS Hasta
//                        2,75%", each side, no minimum printed. The sheet
//                        prints one ceiling for every channel and says
//                        bonuses may follow "volúmenes y frecuencia de
//                        operaciones", so the figure is that ceiling.
//   IVA                  "En los casos que corresponda deberá adicionarse el
//                        IVA sobre el importe de la comisión o arancel que
//                        surja de aplicar los porcentajes". A share or a
//                        CEDEAR takes the 21% rate, on the commission.
//   Market rights        "Adicionalmente a los aranceles expuestos se le
//                        deberán sumar los derechos de Mercado ... que fijen
//                        Bolsas y Mercados Argentinos S.A. (BYMA)". BYMA's
//                        August 2026 table, cash price-time: 0.05% on a
//                        private share or a CEDEAR, each side, plus IVA.
//                        https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   Cable lines          "Liquidaciones por Dólar Cable (por transacción)
//                        Hasta U$S 50". A cable (C) line settles in cable
//                        dollars, so each execution on it takes that
//                        ceiling, USD 50, with no IVA (a fixed charge, not
//                        a percentage).
//   Custody              "Costo de CV por 2" (twice Caja de Valores' own
//                        fee): small, left out. Account opening and
//                        maintenance, and local peso and dollar transfers,
//                        are "Sin Cargo".
//   The sheet prints no same-session waiver; the figure assumes another day.
//
// Cash: local transfers in pesos and dollars are free and cable dollars
// are settled (deposits.mjs ARS and USD), so a line settles in its own
// currency and no FX enters the number. Paying a peso line from dollars,
// or a dollar line from pesos, is the MEP quote (a cable line ending in C:
// the CCL quote). Half the buy/sell spread, 2026-10-21 14:57 ART
// (dolarapi.com, casas "bolsa" and "contadoconliqui"), is the remark: MEP
// 1,546.40 / 1,547.60, CCL 1,633.10 / 1,633.60.
//
//   node brokers/nacionbursatil/nacionbursatil_cost.mjs GGAL BCBA ARS --shares=10 --price=5795
//   node brokers/nacionbursatil/nacionbursatil_cost.mjs AAPLD BCBA USD --shares=10 --price=17.90
//   node brokers/nacionbursatil/nacionbursatil_cost.mjs AAPLC BCBA USD --shares=10 --price=17.04
//   node brokers/nacionbursatil/nacionbursatil_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("nacionbursatil-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://nacionbursatil.com.ar/assets/pdf/Tabla-de-Aranceles-y-Comisiones-2025_aprobados-Directorio-09-04-2025.pdf",
  market: "https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf",
  readOn: "2026-10-21",
  inForce: "2025-04-09",
  marketOn: "2026-08-14",
  entity: "Nación Bursátil S.A. (ALyC y AN integral n° 26 CNV)",
};

const IVA = 0.21;
const RATE = 0.0275;
// USD, each execution on a cable line, no IVA.
const CABLE_FEE = 50;
const MARKET = 0.0005;
// Buy / sell, pesos per dollar, 2026-10-21 14:57 ART. Half the spread over the mid.
const MEP = [1546.4, 1547.6];
const CCL = [1633.1, 1633.6];
const half = ([buy, sell]) => (((sell - buy) / (sell + buy)) * 100).toFixed(3);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

// A dollar line whose ticker is a peso ticker plus C (BMA.C: plus ".C") is
// the cable line, and so is a dollar line ending in C that shares its ISIN
// with a dollar line ending in D (GOGLC next to GOGLD, for GOOGL).
const pesoTickers = new Set(rows.filter((r) => code(r.currency) === "ARS").map((r) => code(r.ticker)));
const mepIsins = new Set(
  rows.filter((r) => code(r.currency) === "USD" && code(r.ticker).endsWith("D") && r.isin).map((r) => code(r.isin))
);
function isCable(row) {
  const ticker = code(row.ticker);
  if (code(row.currency) !== "USD" || !ticker.endsWith("C")) return false;
  const stem = ticker.slice(0, -1);
  return pesoTickers.has(stem) || pesoTickers.has(stem.replace(/\.$/, "")) || mepIsins.has(code(row.isin));
}
function fxNote(row) {
  if (code(row.currency) === "ARS") return fxRemark(half(MEP), "ARS");
  return fxRemark(half(isCable(row) ? CCL : MEP), "USD");
}

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const withIva = (amount) => amount * (1 + IVA);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
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
    return { ...answer, why: "le catalogue Nación Bursátil n'existe pas encore : lancer `node brokers/nacionbursatil/nacionbursatil_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Nación Bursátil` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Nación Bursátil`,
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
  const cable = isCable(m.row);
  const shared = {
    ...answer,
    listing,
    remark: fxNote(m.row),
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `plafond imprimé, tableau du 9 avril 2025 relu le ${SCHEDULE.readOn} : jusqu'à 2,75 % + IVA par exécution, sans minimum ; ` +
      `droits BYMA 0,05 % + IVA, tableau du ${SCHEDULE.marketOn}` +
      (listing.currency === "USD" ? (cable ? " ; ligne câble (C) : liquidation câble 50 USD par exécution (plafond)" : " ; ligne MEP (D)") : ""),
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
  const commission = withIva(notional * RATE) * 2;
  const rights = withIva(notional * MARKET) * 2;
  const cableUsd = cable ? CABLE_FEE * 2 : 0;
  const brokerFees = plus(dollars(commission, listing.currency), cableUsd);
  const bourse = dollars(rights, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const confidence = [
    shared.basis,
    `2,75 % de ${notional.toFixed(2)} ${listing.currency}`,
    "le tableau imprime un plafond (« hasta ») et des bonifications selon volume et fréquence, sans taux plus bas chiffré ; droits BYMA pris au tableau BYMA",
    "ligne dans sa devise : pas de change",
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
    commission: { rate: RATE, min: 0, vat: IVA, currency: listing.currency, eachWay: true, ...(cable ? { cableUsd: CABLE_FEE } : {}) },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    ...(brokerFees == null ? { why: `pas de taux pour convertir ${listing.currency} en dollars` } : {}),
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, cableUsd: CABLE_FEE, marketRights: MARKET, iva: IVA, mep: MEP, ccl: CCL }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/nacionbursatil/nacionbursatil_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
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
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
