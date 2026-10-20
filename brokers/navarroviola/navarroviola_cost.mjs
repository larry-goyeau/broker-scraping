// What one round trip costs at Navarro Viola: buy n shares at price p, sell
// them back at once, in dollars. Buenos Aires shares and CEDEARs, in pesos
// or in dollars (MEP, cable), as the Ingematica board names them (the board
// is shared with LDT and Parakeet; the fees are not). Bonds, options,
// cauciones and funds stay out.
//
// Read on 2026-10-18. The "Aranceles" page, dated 06/06/2024, links one
// sheet: Anexo VI, "Tabla de Aranceles", "Vigencia de tabla de Aranceles:
// Mayo 2023". The figures are drawn in a font with no text map; they were
// read off the rendered page.
//   https://www.navarroviola.com.ar/Informe/Nuestros-Aranceles
//   https://www.navarroviola.com.ar/TempFiles/38318aa1-72d4-4bf5-ae5b-6ae8669940f6.pdf
//
//   Shares, standard     "Máximo: 2% + IVA (Mínimo: $ 100 + IVA)", each side.
//   Web                  "Aranceles Web (compra-venta de acciones y títulos
//                        públicos): Máximo: 70% del arancel estándar". The
//                        online order is this ticket, so the figure is 70 %
//                        of the standard ceiling: 1.4 % + IVA, minimum
//                        70 pesos + IVA, each side. A dollar line takes the
//                        peso equivalent of that minimum.
//   IVA                  "+ IVA" with no rate printed. A share or a CEDEAR
//                        takes the 21 % rate those words mean.
//   Market rights        "Derechos de Mercado (Acciones): 0,0951% (IVA
//                        Incluido)", each side. That is the broker's printed
//                        line and it is the figure. BYMA's own August 2026
//                        table is 0.05 % + IVA (0.0605 %); the sheet has not
//                        caught up, and what it bills is what it prints.
//   Foreign shares       "Compra/Venta de Acciones del Exterior" (USD 10
//                        minimum, 2 % + IVA + broker costs) is an order
//                        abroad. Every line here is on BYMA, CEDEARs
//                        included, so it is not this ticket.
//
// Not this order, so in the remark: custody (minimum 500 pesos + IVA,
// maximum 3,000 pesos + IVA + Caja de Valores costs; the period is not
// printed), the CEDEAR conversion (up to USD 0.10 a share + costs), MEP
// transfers (up to USD 10 / 25). No same-session waiver is printed; the
// figure assumes another day. There is no conversion on the ticket.
//
// Cash: a peso account and a dollar account (deposits.mjs), so a line
// settles in its own currency and no FX enters the number. Paying a
// peso line from dollars, or a dollar line from pesos, is the MEP quote
// (a cable line ending in C: the CCL quote). Half the buy/sell spread,
// 2026-10-18 20:57 (dolarapi.com, casas "bolsa" and
// "contadoconliqui"), is the remark: MEP 1,534.30 / 1,542.50, CCL
// 1,618.40 / 1,620.50.
//
//   node brokers/navarroviola/navarroviola_cost.mjs GGAL BCBA ARS --shares=10 --price=5940
//   node brokers/navarroviola/navarroviola_cost.mjs SPY BCBA ARS --shares=20 --price=20990
//   node brokers/navarroviola/navarroviola_cost.mjs AAPLD BCBA USD --shares=10 --price=18
//   node brokers/navarroviola/navarroviola_cost.mjs --schedule
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

const CATALOGUE = new URL("navarroviola-parsed.json", import.meta.url);

const SCHEDULE = {
  page: "https://www.navarroviola.com.ar/Informe/Nuestros-Aranceles",
  url: "https://www.navarroviola.com.ar/TempFiles/38318aa1-72d4-4bf5-ae5b-6ae8669940f6.pdf",
  readOn: "2026-10-18",
  inForce: "2023-05",
  entity: "Navarro Viola y Cía. S.A.",
};

const IVA = 0.21;
const STANDARD = 0.02;
const STANDARD_MIN_ARS = 100;
const WEB_SHARE = 0.7;
const RATE = STANDARD * WEB_SHARE;
const MIN_ARS = STANDARD_MIN_ARS * WEB_SHARE;
// IVA included, as printed.
const MARKET = 0.000951;
const REMARK =
  "Custody 500 to 3,000 pesos + VAT.";
// Buy / sell, pesos per dollar, 2026-10-18 20:57. Half the spread over the mid.
const MEP = [1534.3, 1542.5];
const CCL = [1618.4, 1620.5];
const half = ([buy, sell]) => Number((((sell - buy) / (sell + buy)) * 100).toFixed(2));

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

// A dollar line whose ticker is a peso ticker plus C is the cable line.
const pesoTickers = new Set(rows.filter((r) => code(r.currency) === "ARS").map((r) => code(r.ticker)));
function fxRemark(row) {
  const ticker = code(row.ticker);
  if (code(row.currency) === "ARS") return `FX ${half(MEP)}% when cash ≠ ARS.`;
  const cable = ticker.endsWith("C") && pesoTickers.has(ticker.slice(0, -1));
  return `FX ${half(cable ? CCL : MEP)}% when cash ≠ USD.`;
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
    remark: REMARK,
  };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Navarro Viola n'existe pas encore : lancer `node brokers/navarroviola/navarroviola_scraping.mjs`",
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Navarro Viola` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Navarro Viola`,
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
    remark: `${REMARK}\n${fxRemark(m.row)}`,
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `arancel web, tableau de mai 2023 relu le ${SCHEDULE.readOn} : 70 % de 2 % + IVA, soit 1,4 % + IVA par exécution, minimum 70 pesos + IVA ; droits de marché 0,0951 % IVA incluse, des deux côtés`,
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
  const rights = notional * MARKET * 2;
  const brokerFees = commission == null ? null : dollars(commission, listing.currency);
  const bourse = dollars(rights, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const floorBites = floor != null && notional * RATE < floor;
  const confidence = [
    shared.basis,
    floorBites ? `le minimum de 70 pesos mord sous ${Math.round(MIN_ARS / RATE)} pesos d'ordre` : `1,4 % de ${notional.toFixed(2)} ${listing.currency}`,
    "la feuille date de mai 2023 ; BYMA est aujourd'hui à 0,05 % + IVA, la ligne imprimée est gardée",
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
    commission: {
      rate: RATE,
      standard: STANDARD,
      min: MIN_ARS,
      minCurrency: "ARS",
      vat: IVA,
      currency: listing.currency,
      eachWay: true,
    },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    ...(brokerFees == null ? { why: `pas de taux pour convertir le minimum de 70 pesos en ${listing.currency}` } : {}),
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
    console.log(
      JSON.stringify(
        { ...SCHEDULE, standard: STANDARD, standardMinArs: STANDARD_MIN_ARS, webShare: WEB_SHARE, rate: RATE, minArs: MIN_ARS, marketRightsIvaIncluded: MARKET, iva: IVA },
        null,
        2
      )
    );
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/navarroviola/navarroviola_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
