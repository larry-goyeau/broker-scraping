// What one round trip costs at CCBolsa (Consorcio Corredores de Bolsa S.A.):
// buy n shares on the Bolsa de Santiago through CCB en Línea and sell them
// back on another day, in dollars. Chilean shares, foreign shares and ETFs
// quoted in pesos, and the Chilean exchange-traded fund lines, all on the
// same Santiago equity book.
//
// Read on 2026-10-23.
//   https://www.ccbolsa.cl/apps/script/modulos/comisiones/comisiones.asp
//     "Servicios en Línea ... Transacción de Acciones": Comisión Fija
//     $3.900, (+) Comisión 0.40%, Especial Club $100 Millones 0.25%.
//   https://www.ccbolsa.cl/apps/script/modulos/preguntas/preguntas-frecuentes.asp
//     "Las comisiones se cobran al final de cada día en una factura única
//     para cada tipo de operación, una para las compras y otra para las
//     ventas ... Una comisión variable equivalente a un 0,4% del monto total
//     transado. (Esta comisión incluye el derecho de bolsa). Una comisión
//     fija de $3.900 ... por factura ... Ambas comisiones se suman, y se
//     agrega el I.V.A." Worked example: $4.000.000 → $16.000 + $3.900 +
//     IVA $3.781 = $23.681 (IVA 19%).
//   So each side: (0.4% of the amount + 3,900 pesos) × 1.19. A buy and a
//   sale on the same day are still two invoices (7,800 pesos fixed), so a
//   same-day exit costs the same. Minimum order 50,000 pesos.
//   Custody at the DCV: "Este servicio no tiene costos para el cliente."
//   Club $100 Millones is a lower rate a client may get: the remark gives
//   it as a cut of this order's commission, the 3,900-peso fixed part
//   included (0.25% against 0.40%, VAT scaling both alike: 19% lower on
//   920,000 pesos; 38% at the bare rates when no order is known).
//
// Cash: pesos only (deposits.mjs CLP), and every line is in pesos, so
// nothing is converted. Chile has no stamp or transaction tax on shares.
//
// The Bolsa de Santiago has no book leaf yet, so the total stays unknown
// until one exists.
//
//   node brokers/ccbolsa/ccbolsa_cost.mjs SQM-B BCS CLP --shares=20 --price=46000
//   node brokers/ccbolsa/ccbolsa_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "ccbolsa";
const CATALOGUE = new URL("ccbolsa-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.ccbolsa.cl/apps/script/modulos/comisiones/comisiones.asp",
  faq: "https://www.ccbolsa.cl/apps/script/modulos/preguntas/preguntas-frecuentes.asp",
  readOn: "2026-10-23",
  entity: "Consorcio Corredores de Bolsa S.A., CCB en Línea",
};

const RATE = 0.004;
const CLUB_RATE = 0.0025;
const FIXED_CLP = 3900;
const IVA = 0.19;
const CASH = "CLP";
const MIN_ORDER_CLP = 50000;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// Club $100 Millones as a cut of the commission on `notional` pesos (fixed
// part included), or of the bare rate when no order is known.
function clubRemark(notional) {
  const x = notional > 0 ? ((RATE - CLUB_RATE) * notional * 100) / (RATE * notional + FIXED_CLP) : ((RATE - CLUB_RATE) / RATE) * 100;
  return `Fees might be ${x >= 10 ? Math.round(x) : Number(x.toFixed(1))}% lower.`;
}
const REMARK = clubRemark(null);

const SANTIAGO_CODES = new Set(["BCS", "XSGO", "SANTIAGO", "BOLSADESANTIAGO", "SANTIAGOSTOCKEXCHANGE"]);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || SANTIAGO_CODES.has(wantPlace) || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
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
    cashCurrency: CASH,
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue CCBolsa n'existe pas encore : lancer `node brokers/ccbolsa/ccbolsa_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue CCBolsa` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez CCBolsa`,
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
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis:
      `page Comisiones et FAQ CCBolsa relues le ${SCHEDULE.readOn} : 0,40 % (droits de bourse compris) + 3 900 pesos par facture, ` +
      `IVA 19 % sur le tout, une facture d'achat et une de vente`,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `CCBolsa ne vend que des lignes en pesos ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, CASH);
  const side = (notional * RATE + FIXED_CLP) * (1 + IVA);
  const brokerFees = dollars(side * 2, CASH);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, CASH),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    `(0,40 % de ${notional.toFixed(0)} + 3 900) × 1,19 = ${side.toFixed(0)} pesos par sens`,
    notional < MIN_ORDER_CLP ? `sous l'ordre minimum de ${MIN_ORDER_CLP} pesos` : null,
    "garde au DCV gratuite ; taux Club $100 Millones (0,25 %) en remarque",
    marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    remark: clubRemark(notional),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    commission: { rate: RATE, fixed: FIXED_CLP, fixedCurrency: CASH, vat: IVA, eachWay: true, currency: CASH },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
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
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, clubRate: CLUB_RATE, fixedClp: FIXED_CLP, iva: IVA, minOrderClp: MIN_ORDER_CLP }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/ccbolsa/ccbolsa_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
