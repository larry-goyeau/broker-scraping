// What one round trip costs at Monabanq: buy n shares at price p on
// Euronext Paris, sell them back at once, online, in dollars. Shares, ETFs,
// ETCs and ETNs of the Paris book (the catalogue's only place).
//
// "Guide de tarification", tarifs en vigueur au 1er octobre 2026 (the same
// file still carries the 1 May 2026 grid, identical for the stock market),
// read on 2026-10-26:
//   https://www.monabanq.com/fr/pdf/tarifications/monabanq_tarification.pdf
//
//   Commission     "Opérations sur tout type de valeurs cotées sur euronext
//                  paris - Frais de courtage en ligne (min 9,90 €) 0,25 %",
//                  each way. Online is the only channel priced.
//   Account fee    "Frais de tenue de Compte titres / PEA - Gratuit dès le 1er
//                  ordre exécuté dans le mois sinon 6 €/mois": a round trip
//                  executes orders, so the month is free. Remark only.
//   Custody        "Droits de garde - Gratuit".
//   Taxes          French TTF 0.40 % on the buy of a French share, from
//                  taxMap.mjs; a French share with no tax-map line is N/A
//                  (taxGap).
//   FX             every kept Paris line trades in euros, the account's
//                  currency: none.
//
// Left out: the PEA column (same 0.25 %, capped at 0.50 % by decree
// 2020-95; the front has no PEA row), foreign markets (0.80 %, min 50 €, not
// in this catalogue), unlisted securities, transfers (15 €/line).
//
//   node brokers/monabanq/monabanq_cost.mjs TTE XPAR EUR --shares=17 --price=58
//   node brokers/monabanq/monabanq_cost.mjs CW8 XPAR EUR --shares=1 --price=600
//   node brokers/monabanq/monabanq_cost.mjs AIR XPAR EUR --shares=5 --price=180
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

const BROKER = "monabanq";
const NAME = "Monabanq";
const CATALOGUE = new URL(`${BROKER}-parsed.json`, import.meta.url);
const PAGE = "https://www.monabanq.com/fr/pdf/tarifications/monabanq_tarification.pdf";
const READ_ON = "2026-10-26";
const SHEET = "guide de tarification Monabanq en vigueur au 1er octobre 2026";
const CASH = "EUR";
const PARIS = { label: "valeurs cotées sur Euronext Paris, en ligne", ccy: "EUR", rate: 0.0025, min: 9.9 };
const REMARK = "Account fee €6/month in a month with no executed order.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
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
  return Math.max(PARIS.min, amountEur * PARIS.rate);
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
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const basis =
    `${SHEET}, relu le ${READ_ON} : ${PARIS.label} ${(PARIS.rate * 100).toLocaleString("fr-FR")} % ` +
    `min ${PARIS.min.toLocaleString("fr-FR")} € par ordre et par sens ; garde gratuite`;
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
    return { ...shared, why: `${listing.currency} : ligne hors euro, aucun change imprimé pour Euronext Paris` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach(notional);
  const brokerFees = each == null ? null : dollars(each * 2, PARIS.ccy);
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
    commission: { each, currency: PARIS.ccy, eachWay: true, rate: PARIS.rate, min: PARIS.min, floored: notional * PARIS.rate < PARIS.min },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      change: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      basis,
      notional * PARIS.rate < PARIS.min
        ? `au plancher : ${PARIS.min.toLocaleString("fr-FR")} € par sens, le taux n'en donnerait que ${(notional * PARIS.rate).toFixed(2)}`
        : `au taux : ${each.toFixed(2)} € par sens`,
      taxTotal ? `taxe à l'achat ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
      "frais de tenue de compte nuls le mois d'un ordre exécuté ; colonne PEA non comptée",
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
