// What one round trip costs at CaixaGuissona (Caja Rural de Guissona, Soc.
// Coop. Crédito): buy n shares at price p on the Bolsa de Madrid, sell them
// back at once, online, in dollars. Shares and ETFs of the Madrid book (the
// catalogue's only place). Orders go through the GVC Gaesco investment
// platform the bank offers ("Gracias a nuestro acuerdo con GVC Gaesco, a
// través de CaixaGuissona y mediante una PLATAFORMA DE INVERSIÓN").
//
// Tariff PDF linked from the bank's "Compra-venta de valores" page,
// "1. TARIFAS DE INTERMEDIACIÓN", "1.1 Renta Variable y ETFs". The live host
// timed out again on 2026-10-26; the text was read from the Wayback copy of
// 2024-08-12. The platform page, read 2026-10-26, still says "Bolsa Nacional:
// A partir de 3,5 EUR ... Nuestra tarifa plana".
//   https://content.caixaguissona.com/particular/borsavalues/tarifesgaescoesp.pdf
//   https://web.archive.org/web/20240812211833/https://content.caixaguissona.com/particular/borsavalues/tarifesgaescoesp.pdf
//   https://www.caixaguissona.com/es/public/gaescoadvantatges
//
//   Commission     "Mercados españoles", column "Caixa Guissona" (the
//                  platform; the other column, "Mesa Operaciones Gaesco",
//                  0,25 % min 9,00 €, is the dealing desk): "Hasta a 4.000€
//                  3,50€ Tarifa plana", "De 4.000€ a 40.000€ 8,00€ Tarifa
//                  plana", "Más de 40.000€ 0,08% Sobre efectivo", each way.
//                  The item is "Intermediación en mercados de renta
//                  variable, ETFs y warrants", so ETFs take it.
//   Clearing and   "se repercutirá al Cliente adicionalmente un coste de
//   settlement     compensación de 0,12€ por ejecución y un coste de
//                  liquidación de 0,35€ por operación": 0,47 € each way (one
//                  execution per order assumed).
//   Canon (Spain)  "los cánones de bolsa" (BME's Tarifas Rectoras). The sheet
//                  prints no amount; Renta 4's sheet prints BME's retail
//                  canon, the same for any intermediary: "tarifa fija de 1 €
//                  por cada orden minorista". 1 € added each way, as renta4es
//                  does.
//   Taxes          "el Impuesto sobre Transacciones Financieras": the Spanish
//                  FTT from taxMap.mjs. A Spanish share with no tax-map line
//                  is N/A (taxGap).
//   FX             every Madrid line trades in euros, the account's
//                  currency: none (the 0,15 % FX of "Operaciones con moneda
//                  extranjera" never applies here).
//
// Left out: custody 0,04 % a quarter, min 1,50 € per security: remark only.
// Dividend collection (0,20 % min 1,00 €), transfers: not in the trip.
//
//   node brokers/caixaguissona/caixaguissona_cost.mjs SAN XMAD EUR --shares=120 --price=7.4
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const BROKER = "caixaguissona";
const NAME = "CaixaGuissona";
const CATALOGUE = new URL(`${BROKER}-parsed.json`, import.meta.url);
const PAGE = "https://content.caixaguissona.com/particular/borsavalues/tarifesgaescoesp.pdf";
const READ_ON = "2026-10-26";
const SHEET = "tarifs GVC Gaesco de CaixaGuissona (copie Wayback du 2024-08-12, page plateforme « A partir de 3,5 EUR » relue)";
const CASH = "EUR";
const SPAIN = {
  label: "mercados españoles, canal Caixa Guissona",
  ccy: "EUR",
  tiers: [
    { upTo: 4000, flat: 3.5 },
    { upTo: 40000, flat: 8 },
    { upTo: Infinity, rate: 0.0008 },
  ],
};
const CLEARING = { each: 0.12 + 0.35, ccy: "EUR" };
const CANON = { each: 1, ccy: "EUR" };
const REMARK = "Custody is 0.04% a quarter (min €1.50 per security).";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const convert = (amount, from, to) => {
  if (code(from) === code(to)) return amount;
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  return usd == null || !per ? null : usd / per;
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// One side, in euros.
export function commissionEach(amountEur) {
  if (amountEur == null) return null;
  const tier = SPAIN.tiers.find((t) => amountEur <= t.upTo);
  return tier.flat ?? amountEur * tier.rate;
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
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${NAME} n'existe pas encore : lancer \`node brokers/${BROKER}/${BROKER}_scraping.mjs\`` };
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
    broker: BROKER,
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
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const basis =
    `${SHEET}, relues le ${READ_ON} : ${SPAIN.label} 3,50 € jusqu'à 4 000 €, 8,00 € de 4 000 à 40 000 €, ` +
    `0,08 % au-delà, par sens, plus 0,12 € de compensation et 0,35 € de liquidation par opération, ` +
    `plus le canon BME de détail de ${CANON.each} € par ordre ` +
    `(répercuté ; montant imprimé par la feuille Renta 4, identique pour tout intermédiaire)`;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${listing.currency} : ligne hors euro, aucun change imprimé pour la Bourse de Madrid` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach(convert(notional, listing.currency, SPAIN.ccy));
  const commissionUsd = each == null ? null : dollars(each * 2, SPAIN.ccy);
  const canonUsd = plus(dollars(CANON.each * 2, CANON.ccy), dollars(CLEARING.each * 2, CLEARING.ccy));
  const brokerFees = plus(commissionUsd, canonUsd);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    commission: { each, currency: SPAIN.ccy, eachWay: true, tiers: SPAIN.tiers, clearingEach: CLEARING.each },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      bourse: finite(canonUsd, 6),
      change: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      basis,
      taxTotal ? `taxe à l'achat ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
      "barème lu sur la copie Wayback de 2024 (hôte du PDF injoignable), confirmé par « A partir de 3,5 EUR » de la page plateforme ; une exécution par ordre supposée",
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
