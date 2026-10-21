// What one round trip costs at GIO Bursátil: buy n shares at price p, sell
// them back at once, in dollars. Buenos Aires shares and CEDEARs (ETF
// certificates included), in pesos, MEP dollars (D lines) or cable dollars
// (C lines), ordered online on oms.giobursatil.com. Bonds, cauciones,
// options and futures stay out.
//
// Read on 2026-10-20. The site's only fee sheet, "Detalle de Aranceles y
// Comisiones", says "Valores vigentes a septiembre de 2021"; the media
// library holds nothing newer (the 2019 sheet is the one before).
//   https://giobursatil.com.ar/wp-content/uploads/2021/09/Comisiones-y-Aranceles-092021.pdf
//
//   Shares and CEDEARs   "Contado Títulos Privados: Hasta 1,50% + Iva",
//                        minimum "$1000", each side. No lower online rate
//                        is printed, so the figure is that ceiling. The
//                        minimum is in pesos; a dollar line takes its peso
//                        equivalent. IVA is put on the fee the minimum
//                        sets as well.
//   IVA                  "+ Iva" with no rate printed. A share or a CEDEAR
//                        takes the 21% rate those words mean.
//   Market rights        The sheet says its rates exclude "Derechos de
//                        Bolsa y Mercado y Gastos de Caja de Valores".
//                        BYMA's August 2026 table, cash price-time: 0.05%
//                        on a private share or a CEDEAR, each side, plus
//                        IVA. Caja de Valores bills custody, not the trade.
//                        https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   Custody              "Servicios de Custodia: Sin Cargo".
//   The sheet prints no same-session waiver; the figure assumes another
//   day. A dividend (2% + IVA), a cable transfer in (USD 100) or out
//   (USD 150) and the conversion of a CEDEAR are not this order.
//
// Cash: peso and dollar sub-accounts (deposits.mjs ARS and USD), so a line
// settles in its own currency and no FX enters the number. Paying a peso
// line from dollars, or a dollar line from pesos, is the MEP quote (a
// cable line ending in C: the CCL quote). Half the buy/sell spread,
// 2026-10-20 16:01 ART (dolarapi.com, casas "bolsa" and
// "contadoconliqui"), is the remark: MEP 1,543.50 / 1,545.30, CCL
// 1,628.10 / 1,629.10.
//
//   node brokers/gio/gio_cost.mjs GGAL BCBA ARS --shares=10 --price=5795
//   node brokers/gio/gio_cost.mjs AAPLD BCBA USD --shares=10 --price=17.90
//   node brokers/gio/gio_cost.mjs AAPLC BCBA USD --shares=10 --price=17.04
//   node brokers/gio/gio_cost.mjs --schedule
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

const CATALOGUE = new URL("gio-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://giobursatil.com.ar/wp-content/uploads/2021/09/Comisiones-y-Aranceles-092021.pdf",
  market: "https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf",
  readOn: "2026-10-20",
  inForce: "2021-09",
  marketOn: "2026-08-14",
  entity: "Gio Bursátil S.A.",
};

const IVA = 0.21;
const RATE = 0.015;
const MIN_ARS = 1000;
const MARKET = 0.0005;
// Buy / sell, pesos per dollar, 2026-10-20 16:01 ART. Half the spread over the mid.
const MEP = [1543.5, 1545.3];
const CCL = [1628.1, 1629.1];
const half = ([buy, sell]) => (((sell - buy) / (sell + buy)) * 100).toFixed(3);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

// A dollar line whose ticker is a peso ticker plus C (BMA.C: plus ".C") is
// the cable line.
const pesoTickers = new Set(rows.filter((r) => code(r.currency) === "ARS").map((r) => code(r.ticker)));
function isCable(row) {
  const ticker = code(row.ticker);
  if (code(row.currency) !== "USD" || !ticker.endsWith("C")) return false;
  const stem = ticker.slice(0, -1);
  return pesoTickers.has(stem) || pesoTickers.has(stem.replace(/\.$/, ""));
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
    return { ...answer, why: "le catalogue GIO n'existe pas encore : lancer `node brokers/gio/gio_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue GIO` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez GIO`,
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
      `plafond imprimé, feuille de septembre 2021 relue le ${SCHEDULE.readOn} : jusqu'à 1,5 % + IVA par exécution, minimum 1 000 pesos + IVA ; ` +
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
      ? `le minimum de 1 000 pesos mord sous ${Math.round(MIN_ARS / RATE)} pesos d'ordre`
      : `1,5 % de ${notional.toFixed(2)} ${listing.currency}`,
    "la feuille date de septembre 2021 et imprime un plafond (« hasta »), pas de taux en ligne plus bas",
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
    ...(brokerFees == null ? { why: `pas de taux pour convertir le minimum de 1 000 pesos en ${listing.currency}` } : {}),
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
    console.error("usage : node brokers/gio/gio_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
