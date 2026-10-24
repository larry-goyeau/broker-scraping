// What one round trip costs at Banco Santa Cruz (Banco de Santa Cruz S.A.,
// Grupo Petersen, its own ALyC): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// from Home Banking. Lines in pesos and in MEP dollars (D lines).
//
// Read on 2026-10-24. "Comisiones y cargos relacionados con distintos
// productos y servicios del Banco - Personas Físicas y Personas Jurídicas
// sin actividad comercial - Vigentes a partir del 1/8/2026":
//   https://assets.ctfassets.net/e7eu92ue673r/a8PmGbsl5CjUwfClFT4jW/7631f0f16ea0f209506224f626068bf7/WEB_BSC_Nota_Aumento_de_Comisiones_Todos_lo_productos__01-08-2026___clientes_CCPJ_Aclaraciones.pdf
//   (linked from https://www.bancosantacruz.com/comisiones-y-tasas)
//   TITULOS, partida 71100 "Compra/Venta de Títulos privados": 1%(*)
//   Min: $ 0,01 on the peso row; partida 71101: 1% on the dollar row; each
//   side.
//   Derechos de Mercado, ByMA, partida 77800 "Acciones, Cedear": 0.08%,
//   each side.
//   Footnote (*): "los valores porcentuales no incluyen el IVA", so both
//   take 21% IVA: 1.21% and 0.0968%. (The table prints the same 1% and
//   0.08% under its "con IVA" columns; the footnote is explicit, and Banco
//   Santa Fe's identical table says the same in its note 14.) The $0.01
//   minimum never binds on a real order.
//   Partida 71000 "Mantenimiento cuenta comitente: Sin cargo" and 71600
//   "Custodia de Títulos Caja de Valores: Sin Cargo": no holding cost.
//   No same-session rate is printed.
//   Notes (12) and (15), on the public-bond rows: 1% on the buy leg of a
//   MEP purchase with AL30, and 1% + 0.02% for UVA mortgage borrowers
//   buying dollars; neither is a share fee.
// Banco Santa Fe, Banco Entre Ríos and Banco San Juan, the group's other
// banks, print the same 1% and 0.08% lines.
//
// In the total: the book, 1% + IVA each side (at least $0.01 a side on a
// peso line), market rights 0.08% + IVA each side, and a tax when
// taxMap.mjs names one.
//
// Cash: a peso and a dollar savings account (deposits.mjs ARS and USD), so a
// line settles in its own currency and no FX enters the number. Paying a
// peso line from dollars, or a MEP line from pesos, is the MEP quote: half
// its buy/sell spread, 2026-10-20 16:01 ART (dolarapi.com casa "bolsa",
// 1,543.50 / 1,545.30, the figure Banco Santa Fe uses), is the remark.
//
//   node brokers/bancosantacruz/bancosantacruz_cost.mjs GGAL BCBA ARS --shares=10 --price=5940
//   node brokers/bancosantacruz/bancosantacruz_cost.mjs AAPLD BCBA USD --shares=10 --price=17.90
//   node brokers/bancosantacruz/bancosantacruz_cost.mjs --schedule
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

const FOLDER = "bancosantacruz";
const NAME = "Banco Santa Cruz";
const CATALOGUE = new URL("bancosantacruz-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://assets.ctfassets.net/e7eu92ue673r/a8PmGbsl5CjUwfClFT4jW/7631f0f16ea0f209506224f626068bf7/WEB_BSC_Nota_Aumento_de_Comisiones_Todos_lo_productos__01-08-2026___clientes_CCPJ_Aclaraciones.pdf",
  page: "https://www.bancosantacruz.com/comisiones-y-tasas",
  readOn: "2026-10-24",
  inForce: "2026-08-01",
  entity: "Banco de Santa Cruz S.A. (ALyC y AN integral n° 68)",
};

const IVA = 0.21;
const RATE = 0.01;
// Partida 71100, peso row: "Min: $ 0,01" a side, before IVA.
const MIN_ARS = 0.01;
const MARKET = 0.0008;
// Buy / sell, pesos per dollar, 2026-10-20 16:01 ART. Half the spread over the mid.
const MEP = [1543.5, 1545.3];
const half = ([buy, sell]) => (((sell - buy) / (sell + buy)) * 100).toFixed(3);
const fxNote = (currency) => fxRemark(half(MEP), currency);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const BUENOS_AIRES = new Set(["BCBA", "XBUE", "BYMA", "BUENOSAIRES"]);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || BUENOS_AIRES.has(wantPlace) || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
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
    return { ...answer, why: `le catalogue ${NAME} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${NAME}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${NAME}`,
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
    remark: fxNote(listing.currency),
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `tarif « Comisiones y cargos » du ${SCHEDULE.inForce}, relu le ${SCHEDULE.readOn} : titres privés 1 % + IVA par sens (minimum 0,01 $ sur la ligne en pesos), ` +
      `droits de marché BYMA actions et CEDEAR 0,08 % + IVA par sens (renvoi (*) : les pourcentages s'entendent hors IVA)` +
      (listing.currency === "USD" ? " ; ligne MEP (D)" : ""),
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = listing.currency === "ARS" ? Math.max(notional * RATE, MIN_ARS) : notional * RATE;
  const commission = side * (1 + IVA) * 2;
  const rights = notional * MARKET * (1 + IVA) * 2;
  const brokerFees = dollars(commission, listing.currency);
  const bourse = dollars(rights, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const confidence = [
    shared.basis,
    `1,21 % de ${notional.toFixed(2)} ${listing.currency} par sens, droits de marché 0,0968 %`,
    "ligne dans sa devise : pas de change",
    "garde Caja de Valores et compte comitente sans frais",
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
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    commission: { rate: RATE, minimum: listing.currency === "ARS" ? MIN_ARS : null, vat: IVA, marketRights: MARKET, eachWay: true, currency: listing.currency },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, minimumArs: MIN_ARS, marketRights: MARKET, iva: IVA, mep: MEP }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error(`usage : node brokers/${FOLDER}/${FOLDER}_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]`);
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
  console.log(JSON.stringify(out, null, 2));
}

printCli();
