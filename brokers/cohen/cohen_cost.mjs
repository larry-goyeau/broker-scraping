// What one round trip costs at Cohen: buy n shares at price p, sell them
// back at once, in dollars. Buenos Aires shares and CEDEARs (ETF
// certificates included), in pesos, MEP dollars (D lines) or cable dollars
// (C lines), as the Ingematica board names them (the board is shared with
// LDT, Navarro Viola and Parakeet; the fees are not), ordered online on
// Cohen Connect. Bonds, cauciones, options, futures and orders abroad stay
// out.
//
// Read on 2026-10-21. The "Aranceles" page, dated 16/05/2024, links one
// sheet, Cohen-Aranceles.pdf, "Aranceles, comisiones y recuperos". It
// prints one schedule for every channel: no separate online rate.
//   https://www.cohen.com.ar/Informe/Legales/Aranceles
//   https://CohenWeb.prod.ingecloud.com/TempFiles/6daba38b-c5b7-4c35-a77d-1ffa75829a3e.pdf
//
//   Contado, renta       "Arancel mínimo $ 100", "Mínimo % 0,10%", "Máximo
//   variable             % 2%", each side. The sheet does not say which
//                        client pays which rate, so the figure is the 2%
//                        ceiling, as LDT's and GIO's are, with the 100-peso
//                        minimum. A dollar line takes the peso equivalent
//                        of that minimum. The 0.1% floor is the remark, a
//                        cut of the commission (2% → 0.1% = 95% lower; the
//                        100-peso minimum binds below about 70 dollars).
//   IVA                  The commission lines print no IVA; the same sheet
//                        bills account maintenance "$250 + IVA", and a
//                        broker's commission on a share or a CEDEAR bears
//                        IVA in Argentina. The figure adds 21%, on the fee
//                        the minimum sets as well.
//   Market rights        Not on the sheet. BYMA bills them on every trade and
//                        the agent passes them on: BYMA's August 2026 table,
//                        cash price-time, 0.05% on a private share or a
//                        CEDEAR, each side, plus IVA.
//                        https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   Maintenance          "$250 + IVA (mensual)", about twenty cents of a
//                        dollar a month: left out.
//   Contado block (same rates) has a BYMA minimum size and is not on the
//   board. A dividend (1% to 2%, minimum 50 pesos) is not this order. No
//   same-session waiver is printed; the figure assumes another day.
//
// Cash: Cohen's "Depósitos y transferencias" page gives a Banco de Valores
// peso account, a Banco de Valores "Dólar Mep" account and a Santander
// Bank N.A. "Dólar Cable" account (deposits.mjs ARS and USD), so a line
// settles in its own currency and no FX enters the number. Paying a peso
// line from dollars, or a dollar line from pesos, is the MEP quote (a cable
// line ending in C: the CCL quote). Half the buy/sell spread, 2026-10-21
// 14:57 ART (dolarapi.com, casas "bolsa" and "contadoconliqui"), is the
// remark: MEP 1,546.40 / 1,547.60, CCL 1,633.10 / 1,633.60.
//   https://www.cohen.com.ar/depositostransferencias/
//
//   node brokers/cohen/cohen_cost.mjs GGAL BCBA ARS --shares=10 --price=5795
//   node brokers/cohen/cohen_cost.mjs AAPLD BCBA USD --shares=10 --price=17.90
//   node brokers/cohen/cohen_cost.mjs AAPLC BCBA USD --shares=10 --price=17.04
//   node brokers/cohen/cohen_cost.mjs --schedule
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

const CATALOGUE = new URL("cohen-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://CohenWeb.prod.ingecloud.com/TempFiles/6daba38b-c5b7-4c35-a77d-1ffa75829a3e.pdf",
  page: "https://www.cohen.com.ar/Informe/Legales/Aranceles",
  market: "https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf",
  readOn: "2026-10-21",
  inForce: "2024-05-16",
  marketOn: "2026-08-14",
  entity: "Cohen S.A. (ALyC integral n° 21 CNV)",
};

const IVA = 0.21;
const RATE = 0.02;
const MIN_ARS = 100;
const REMARK = "Commission can be up to 95% lower; the sheet does not say when.";
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

// The peso floor in the listing's currency (a MEP or cable line is in dollars).
const floorIn = (currency) => {
  if (code(currency) === "ARS") return MIN_ARS;
  const usd = toUsd(MIN_ARS, "ARS");
  const per = usdPer(currency);
  return usd == null || per == null ? null : usd / per;
};

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
    return { ...answer, why: "le catalogue Cohen n'existe pas encore : lancer `node brokers/cohen/cohen_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Cohen` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Cohen`,
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
    remark: [REMARK, fxNote(m.row)].filter(Boolean).join("\n"),
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `plafond imprimé, feuille du 16/05/2024 relue le ${SCHEDULE.readOn} : contado renta variable 0,10 % à 2 %, pris à 2 % + IVA par exécution, minimum 100 pesos + IVA ; ` +
      `droits BYMA 0,05 % + IVA, tableau du ${SCHEDULE.marketOn}` +
      (listing.currency === "USD" ? (cable ? " ; ligne câble (C)" : " ; ligne MEP (D)") : ""),
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
  const floor = floorIn(listing.currency);
  const each = floor == null ? null : withIva(Math.max(notional * RATE, floor));
  const commission = each == null ? null : each * 2;
  const rights = withIva(notional * MARKET) * 2;
  const brokerFees = commission == null ? null : dollars(commission, listing.currency);
  const bourse = dollars(rights, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const floorBites = floor != null && notional * RATE < floor;
  const confidence = [
    shared.basis,
    floorBites
      ? `le minimum de 100 pesos mord sous ${Math.round(MIN_ARS / RATE)} pesos d'ordre`
      : `2 % de ${notional.toFixed(2)} ${listing.currency}`,
    "la feuille imprime une fourchette 0,10 %–2 % sans dire qui paie quoi ; l'IVA n'est pas imprimé sur les commissions, ajouté à 21 %",
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
    commission: { rate: RATE, min: MIN_ARS, minCurrency: "ARS", vat: IVA, currency: listing.currency, eachWay: true },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    ...(brokerFees == null ? { why: `pas de taux pour convertir le minimum de 100 pesos en ${listing.currency}` } : {}),
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, minArs: MIN_ARS, marketRights: MARKET, iva: IVA, mep: MEP, ccl: CCL }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/cohen/cohen_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
