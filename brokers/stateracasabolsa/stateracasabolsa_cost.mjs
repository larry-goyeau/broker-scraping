// What one round trip costs at Statera Casa de Bolsa: buy n shares on the
// Bolsa de Valores de Caracas and sell them straight back, in dollars.
// Orders go through "Statera en Línea (SEL)", a "Plataforma que permite,
// desde un celular o PC, registrarse como cliente, colocar órdenes de compra
// y venta de valores" (Servicios.html).
//
// https://www.stateracasadebolsa.com/tarifas.html read on 2026-10-26
// ("Tarifas y Comisiones"):
//   Renta Variable "Hasta 5%", "Aplicable sobre el monto de la operación y
//   negociable con el cliente en función del tamaño de la operación."
//   "No incluyen impuestos, derechos de registro, gastos administrativos ni
//   asesorías de terceros."
// The rate is discretionary up to 5%, so the max is taken (owner rule): 5%
// of the order, on the buy and on the sell (the page names no side). No
// minimum is printed.
// What the page leaves out is the same for every BVC member, and two other
// members print it:
//   https://mercosur.com.ve/home/centrode-sopore/ "la bolsa de valores de
//   caracas cobra 0,1% o 2,3 Bs (derecho de registro), IVA y en el caso de
//   la venta de acciones se debita 1% por ISLR"
//   https://www.per-capital.com/assets/comisiones-per-capital.pdf Compra
//   "IVA, 0,10% Registro BVC"; Venta "IVA, 0,10% Registro BVC, 1% ISLR"
// so each side adds IVA at the Venezuelan general rate, 16%, on the
// commission and the BVC "derecho de registro", 0.1% of the order (at least
// 2.3 Bs); the sell adds ISLR, 1% of the sale amount (the Ley de ISLR's
// proportional tax on BVC share sales, debited by the broker).
// Left out: "gastos administrativos" (no figure), IVA on the registration
// right, the Caja Venezolana de Valores' custody (no figure printed), bank
// charges on funding.
//
// Formula, each side: 5% × notional × 1.16 + max(0.1% × notional, 2.3 Bs);
// sell side + 1% × notional; plus the book.
//
// Cash: a Venezuelan account in bolívares; every catalogue line is in VES,
// so nothing is converted.
//
// FX: fx.mjs has no bolívar, so this file carries its own rate for the same
// day as fx.mjs, as brokers/merinvest does: 808.90246741 VES per USD on
// 2026-09-07.
//   https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-07/v1/currencies/usd.min.json
//
// Book: spreads/venues.mjs does not know the Bolsa de Valores de Caracas,
// so there is no leaf and the total stays unknown. The BVC publishes its
// best bid and offer (get_cotizaciones, read by
// ../mercosurcasabols/bvcBook.mjs), which an adapter could read.
//
//   node brokers/stateracasabolsa/stateracasabolsa_cost.mjs BVL "Caracas Stock Exchange" VES --shares=390 --price=2100
//   node brokers/stateracasabolsa/stateracasabolsa_cost.mjs TDV.D "Caracas Stock Exchange" VES --shares=640 --price=1260
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd as fxToUsd, usdPer as fxUsdPer } from "../../fx.mjs";

const CATALOGUE = new URL("stateracasabolsa-parsed.json", import.meta.url);
const PAGE = "https://www.stateracasadebolsa.com/tarifas.html";
const SERVICES = "https://www.stateracasadebolsa.com/Servicios.html";
const CHARGES = "https://www.per-capital.com/assets/comisiones-per-capital.pdf";
const CHARGES_ALSO = "https://mercosur.com.ve/home/centrode-sopore/";
const BOARD = "https://www.bolsadecaracas.com/resumen-mercado/";
const READ_ON = "2026-10-26";
const BROKER = "Statera";
const FOLDER = "stateracasabolsa";
const RATE = 0.05;
const FLAT_UPTO_VES = 0;
const FLAT_VES = 0;
const IVA = 0.16;
const REGISTRO = 0.001;
const REGISTRO_MIN_VES = 2.3;
const ISLR_SELL = 0.01;
const CASH = ["VES"];
const REMARK = "";

// Bolívares per dollar, 2026-09-07 (fx.mjs AS_OF), not in fx.mjs.
const VES_PER_USD = 808.90246741;
const VES_SOURCE = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-07/v1/currencies/usd.min.json";

const usdPer = (currency) => (String(currency || "").toUpperCase() === "VES" ? 1 / VES_PER_USD : fxUsdPer(currency));
const toUsd = (amount, currency) => {
  if (String(currency || "").toUpperCase() !== "VES") return fxToUsd(amount, currency);
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  return Number(amount) / VES_PER_USD;
};
const toVes = (amount, currency) => {
  const usd = toUsd(amount, currency);
  return usd == null ? null : usd * VES_PER_USD;
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const CARACAS = new Set(["CARACASSTOCKEXCHANGE", "BVCA", "BVCV", "BVC", "BOLSADEVALORESDECARACAS", "CARACAS"]);

// One side, in the listing's currency: the registration minimum is in
// bolívares. Statera prints no flat floor (FLAT_UPTO_VES = 0).

function side(notional, currency) {
  const ves = toVes(notional, currency);
  if (ves == null) return null;
  const flat = ves <= FLAT_UPTO_VES;
  const commissionVes = flat ? FLAT_VES : ves * RATE;
  const registroVes = Math.max(ves * REGISTRO, REGISTRO_MIN_VES);
  const k = notional / ves;
  return { flat, commission: commissionVes * (1 + IVA) * k, registro: registroVes * k };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || CARACAS.has(wantPlace)) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
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
    cashCurrency: "VES",
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${BROKER}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${BROKER}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
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
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    cashCurrency: CASH.includes(listing.currency) ? listing.currency : "VES",
    basis:
      `tarifs ${BROKER} relus le ${READ_ON} : renta variable « hasta 5 % », négociable selon la taille ; le maximum, 5 %, ` +
      `est retenu par sens, + IVA 16 % (taux général, non imprimé). Hors tarif, communs à tous les membres de la BVC ` +
      `(Per Capital, Mercosur) : droit d'enregistrement BVC 0,1 % (minimum 2,3 Bs) par sens ; ISLR 1 % du montant à la vente.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), source: VES_SOURCE },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, services: SERVICES, charges: CHARGES, chargesAlso: CHARGES_ALSO, board: BOARD, fx: VES_SOURCE },
  };
  if (!CASH.includes(listing.currency)) {
    return { ...shared, why: `${BROKER} ne règle que des bolivars ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = side(notional, listing.currency);
  if (!each) return { ...shared, why: `aucun taux pour ${listing.currency}` };
  const brokerFees = dollars(each.commission * 2, listing.currency);
  const bourse = dollars(each.registro * 2, listing.currency);
  const taxUsd = dollars(notional * ISLR_SELL, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: m.venue
            ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
            : "aucun carnet : la Bourse de Caracas n'est pas dans spreads/venues.mjs (la BVC publie pourtant sa meilleure offre, différée de 15 min)",
        }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      rate: RATE,
      flat: FLAT_VES,
      flatUpTo: FLAT_UPTO_VES,
      flatCurrency: "VES",
      vat: IVA,
      each: each.commission,
      registro: REGISTRO,
      registroMin: REGISTRO_MIN_VES,
      islrSell: ISLR_SELL,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: finite(bourse, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      each.flat
        ? `ordre de ${notional} ${listing.currency} sous 1 500 Bs : commission fixe de 70 Bs + IVA par sens`
        : `5 % (maximum de « hasta 5 % ») de ${notional} ${listing.currency} + IVA 16 % = ${each.commission.toFixed(2)} ${listing.currency} par sens`,
      `droit BVC ${each.registro.toFixed(2)} ${listing.currency} par sens, ISLR ${(notional * ISLR_SELL).toFixed(2)} ${listing.currency} à la vente`,
      `VES à ${VES_PER_USD} pour 1 USD au ${FX_AS_OF}, taux propre à ce fichier`,
      "droit BVC et ISLR repris des feuilles de Per Capital et Mercosur ; frais administratifs, IVA du droit d'enregistrement et garde CVV : non chiffrés, rien d'ajouté",
    ].join(" ; "),
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
