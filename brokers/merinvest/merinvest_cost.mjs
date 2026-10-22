// What one round trip costs at Mercantil Merinvest Casa de Bolsa: buy n
// shares on the Bolsa de Valores de Caracas and sell them straight back, in
// dollars. Orders can be sent over the internet with a Banco Mercantil
// "Llave Mercantil" (account terms, clause 5 d, "Ordenes Electrónicas").
//
// https://www.mercantilmerinvest.com/documents/tarifas-y-comisiones.pdf
// read on 2026-10-21 ("Comisiones Bursátiles Vigentes", file of 6 August
// 2026). Renta variable:
//   Comisión mínima           Bs. 1,00
//   Hasta Bs. 2.000,00        2,50 %
//   Más de Bs. 2.001,00       2,00 %
// The sheet names no side; it is taken on the buy and on the sell, at the
// rate of the order's amount (above Bs 2,000, about $2.50, the 2 % rate
// applies to the whole amount). The tariff is in bolívares; a share the BVC
// quotes in dollars (GZL.A, GZL.B; both left out of the book as dormant
// since 2026-10-22) takes the same rates, the tier read on its bolívar
// value. The account terms put "derechos de bolsa", settlement
// and custody charges on the client (clause 26) and print no figure for
// them, and the sheet says nothing of VAT; none is added.
//   https://www.mercantilmerinvest.com/documents/condicionados-generales-cuenta-corretaje.docx
//
// Cash: the client names a bank account in each currency it trades, and
// Merinvest takes no order on a dollar security without a dollar account
// (clause 6), so a VES line is paid in bolívares and a USD line in
// dollars; nothing is converted.
//
// FX: fx.mjs has no bolívar, so this file carries its own rate for the same
// day as fx.mjs, as brokers/sharq does for the dinar: 808.90246741 VES per
// USD on 2026-09-07.
//   https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-07/v1/currencies/usd.min.json
//
// Book: spreads/venues.mjs does not know the Bolsa de Valores de Caracas,
// so there is no leaf and the total stays unknown. The BVC does publish a
// public best bid and offer (get_cotizaciones on its "Resumen del mercado"
// page, 15 minutes late), which an adapter could read.
//
//   node brokers/merinvest/merinvest_cost.mjs BVL "Caracas Stock Exchange" VES --shares=100 --price=2199
//   node brokers/merinvest/merinvest_cost.mjs GZL.A "Caracas Stock Exchange" USD --shares=10 --price=5
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd as fxToUsd, usdPer as fxUsdPer } from "../../fx.mjs";

const CATALOGUE = new URL("merinvest-parsed.json", import.meta.url);
const PAGE = "https://www.mercantilmerinvest.com/documents/tarifas-y-comisiones.pdf";
const TERMS = "https://www.mercantilmerinvest.com/documents/condicionados-generales-cuenta-corretaje.docx";
const BOARD = "https://www.bolsadecaracas.com/resumen-mercado/";
const READ_ON = "2026-10-21";
const BROKER = "Merinvest";
const MIN_VES = 1;
const TIER_VES = 2000;
const LOW = 0.025;
const HIGH = 0.02;
const CASH = ["VES", "USD"];
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

// One side, in the listing's currency: the tier and the minimum are in
// bolívares.
function side(notional, currency) {
  const ves = toVes(notional, currency);
  if (ves == null) return null;
  const rate = ves <= TIER_VES ? LOW : HIGH;
  const feeVes = Math.max(ves * rate, MIN_VES);
  return { rate, fee: (feeVes / ves) * notional, floor: ves * rate < MIN_VES };
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/merinvest/merinvest_scraping.mjs\`` };
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
    broker: "merinvest",
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
      `commissions boursières ${BROKER} en vigueur relues le ${READ_ON} : renta variable 2,50 % jusqu'à 2 000 Bs, ` +
      `2,00 % au-delà, minimum 1 Bs, prises à l'achat et à la vente. Droits de bourse, règlement et TVA : ` +
      `aucun chiffre publié, rien d'ajouté.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), source: VES_SOURCE },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, terms: TERMS, board: BOARD, fx: VES_SOURCE },
  };
  if (!CASH.includes(listing.currency)) {
    return { ...shared, why: `${BROKER} ne règle que des bolivars et des dollars ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = side(notional, listing.currency);
  if (!each) return { ...shared, why: `aucun taux pour ${listing.currency}` };
  const brokerFees = dollars(each.fee * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

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
    commission: { rate: each.rate, min: MIN_VES, minCurrency: "VES", each: each.fee, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
    },
    confidence: [
      each.floor
        ? "le minimum de 1 Bs s'applique"
        : `${(each.rate * 100).toFixed(2).replace(".", ",")} % de ${notional} ${listing.currency} = ${each.fee.toFixed(2)} ${listing.currency} par sens`,
      `VES à ${VES_PER_USD} pour 1 USD au ${FX_AS_OF}, taux propre à ce fichier`,
      "les côtés ne sont pas précisés : la commission est prise à l'achat et à la vente",
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
