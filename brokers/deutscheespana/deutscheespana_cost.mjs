// What one round trip costs at Deutsche Bank España (Deutsche Bank S.A.E.):
// buy n shares at price p on the Bolsa de Madrid, sell them back at once,
// online, in dollars. Shares and ETFs of the Madrid book (the catalogue's
// only place).
//
// "Folleto informativo de tarifas máximas en operaciones y servicios del
// mercado de valores", read on 2026-10-26.
//   https://www.deutsche-bank.es/dam/spain/es/pbc/pdf/Tarifas_valores.pdf
//
//   Commission     "En mercados españoles: recepción, transmisión, ejecución
//                  y liquidación" 0,31 % "sobre efectivo", "Mínimo por
//                  operación" 12,00 €, each way. The folleto prints one rate
//                  for every channel, so the online order pays it too.
//                  Section 7 names this item "acciones y participaciones de
//                  ETF", so ETFs take it.
//   Canon (Spain)  passed through: "Las tasas y cánones repercutidos por los
//                  mercados y los sistemas de liquidación". The bank prints
//                  no amount; Renta 4's sheet prints BME's retail canon, the
//                  same for any intermediary: "tarifa fija de 1 € por cada
//                  orden minorista". 1 € added each way, as renta4es does.
//   Taxes          the Spanish FTT from taxMap.mjs. A Spanish share with no
//                  tax-map line is N/A (taxGap).
//   FX             every Madrid line trades in euros, the account's
//                  currency: none (the folleto's 0,3 % FX, min 12,02 €,
//                  never applies here).
//
// Left out: the Iberclear settlement charge (not printed by the bank or by
// Renta 4's sheet, as in renta4es). Custody 1,40 % a year, min 12 € per
// security: remark only. Dividend collection, transfers: not in the trip.
//
//   node brokers/deutscheespana/deutscheespana_cost.mjs SAN XMAD EUR --shares=120 --price=7.4
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

const BROKER = "deutscheespana";
const NAME = "Deutsche Bank España";
const CATALOGUE = new URL(`${BROKER}-parsed.json`, import.meta.url);
const PAGE = "https://www.deutsche-bank.es/dam/spain/es/pbc/pdf/Tarifas_valores.pdf";
const READ_ON = "2026-10-26";
const SHEET = "folleto de tarifas máximas Deutsche Bank España";
const CASH = "EUR";
const SPAIN = { label: "mercados españoles", ccy: "EUR", rate: 0.0031, min: 12 };
const CANON = { each: 1, ccy: "EUR" };
const REMARK = "Custody is 1.40% a year (min €12 per security).";

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
  return Math.max(SPAIN.min, amountEur * SPAIN.rate);
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
    `${SHEET}, relues le ${READ_ON} : ${SPAIN.label} ${(SPAIN.rate * 100).toLocaleString("fr-FR")} % ` +
    `min ${SPAIN.min} € par opération et par sens, toutes voies, plus le canon BME de détail de ${CANON.each} € par ordre ` +
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
  const canonUsd = dollars(CANON.each * 2, CANON.ccy);
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
    commission: { each, currency: SPAIN.ccy, eachWay: true, rate: SPAIN.rate, min: SPAIN.min },
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
      "tarifs maximaux publiés, seul barème imprimé ; règlement Iberclear non compté",
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
