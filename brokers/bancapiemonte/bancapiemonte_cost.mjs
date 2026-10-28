// What one round trip costs at Banca del Piemonte: buy n shares at price p
// on Borsa Italiana (Euronext Milan shares, ETFplus ETFs, ETCs and ETNs)
// through the Deposito Titoli online (internet banking BPnow), sell them
// back at once, in dollars. The catalogue's only place is "Italy".
//
// "Foglio informativo - Titoli - 19/06/2026", read on 2026-10-26:
//   https://www.bancadelpiemonte.it/wp-content/uploads/2021/10/TITOLI.pdf
//
//   Commission     "Operazioni effettuate per via telematica - Commissioni -
//                  Titoli azionari ed ETF negoziati in Italia - 0,25% su ogni
//                  eseguito min. € 9,38", each way (shares, ETFs, ETCs and
//                  ETNs alike: the sheet sets no ETFplus line apart).
//   Fixed fee      "Rimborso spese - Per ogni emissione di nota informativa e
//                  fissato bollato € 5,16": every execution issues one, and
//                  the sheet does not exempt online orders, so € 5,16 is
//                  added to each side.
//   Custody        "Per dossier con anche o solo titoli azionari di qualsiasi
//                  specie italiani € 50,00 semestrali", "... esteri € 80,00
//                  semestrali": remark only.
//   Taxes          Italian FTT on the buy of an Italian share, from
//                  taxMap.mjs; an Italian share with no tax-map line is N/A
//                  (taxGap).
//   FX             every kept Milan line trades in euros, and the online
//                  dossier is "il deposito titoli in euro" (offer sheet
//                  below): none.
//   https://www.bancadelpiemonte.it/wp-content/uploads/2024/04/offerta-titoli.pdf
//
// Left out: branch orders ("Operazioni di raccolta ordini", 1,015% min.
// € 19,36: not online), foreign markets (0,625% min. € 37,50, not in this
// catalogue), the 0,05% "commissione valutaria" on foreign-currency
// securities (none here), bonds, the annual 0,20% stamp duty on holdings.
//
//   node brokers/bancapiemonte/bancapiemonte_cost.mjs ENI XMIL EUR --shares=70 --price=14
//   node brokers/bancapiemonte/bancapiemonte_cost.mjs SWDA XMIL EUR --shares=9 --price=110
//   node brokers/bancapiemonte/bancapiemonte_cost.mjs STLAM XMIL EUR --shares=110 --price=9
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

const BROKER = "bancapiemonte";
const NAME = "Banca del Piemonte";
const CATALOGUE = new URL(`${BROKER}-parsed.json`, import.meta.url);
const PAGE = "https://www.bancadelpiemonte.it/wp-content/uploads/2021/10/TITOLI.pdf";
const READ_ON = "2026-10-26";
const SHEET = "foglio informativo Titoli de Banca del Piemonte du 19/06/2026";
const CASH = "EUR";
const MILAN = {
  label: "titres actions et ETF négociés en Italie, par voie télématique",
  ccy: "EUR",
  rate: 0.0025,
  min: 9.38,
  fixed: 5.16,
};
const REMARK = "Custody €100 a year (€160 with foreign shares or ETFs).";

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
// One side, in euros: the online commission plus the fixed fee for the
// contract note ("nota informativa e fissato bollato").
export function commissionEach(amountEur) {
  if (amountEur == null) return null;
  return Math.max(MILAN.min, amountEur * MILAN.rate) + MILAN.fixed;
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
    `${SHEET}, relu le ${READ_ON} : ${MILAN.label} ${(MILAN.rate * 100).toLocaleString("fr-FR")} % ` +
    `min ${MILAN.min.toLocaleString("fr-FR")} € par exécution et par sens, plus ${MILAN.fixed.toLocaleString("fr-FR")} € ` +
    `de note d'opéré (nota informativa e fissato bollato) par exécution`;
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
    return { ...shared, why: `${listing.currency} : ligne hors euro, le dossier en ligne est en euros et aucun change n'est compté pour Milan` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach(notional);
  const brokerFees = each == null ? null : dollars(each * 2, MILAN.ccy);
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
    commission: {
      each,
      currency: MILAN.ccy,
      eachWay: true,
      rate: MILAN.rate,
      min: MILAN.min,
      fixed: MILAN.fixed,
      floored: notional * MILAN.rate < MILAN.min,
    },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      change: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      basis,
      notional * MILAN.rate < MILAN.min
        ? `au plancher : ${MILAN.min.toLocaleString("fr-FR")} € par sens, le taux n'en donnerait que ${(notional * MILAN.rate).toFixed(2)}`
        : `au taux : ${(notional * MILAN.rate).toFixed(2)} € par sens`,
      `${MILAN.fixed.toLocaleString("fr-FR")} € de note d'opéré ajoutés à chaque sens (la feuille n'en exempte pas les ordres en ligne) : ${each.toFixed(2)} € par sens`,
      taxTotal ? `taxe à l'achat ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
      "droits de garde semestriels (50 € titres italiens, 80 € étrangers) en remarque ; droit de timbre annuel 0,20 % non compté",
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
