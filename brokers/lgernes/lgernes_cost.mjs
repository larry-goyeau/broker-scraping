// What one round trip costs at Lægernes Bank (Lægernes Pension & Bank): buy
// n shares on Nasdaq Copenhagen in the netbank and sell them straight back,
// in dollars. The catalogue is the Copenhagen main market book minus the
// foreign lines (../frslevmollerupsp/copenhagenBook.mjs).
//
// Fee list read on 2026-10-26 ("Gebyrer, gældende fra 23. oktober 2026"):
//   https://www.lpb.dk/media/0e1d413b-6ac3-4e9a-b8ec-5c7be09b482b/IlaeTg/Dokumenter/Bank/Priser%20og%20vilk%C3%A5r/Priser/Aktuelle%20gebyrer.pdf
//   Fondshandel via netbank:
//     "Køb og salg af aktier noteret på Nasdaq OMX Nordic samt noterede og
//      unoterede investeringsbeviser 0,10 pct. af kursværdien min. 29 kr."
//     "Hvis handelsordren [afgives] af medarbejdere i banken tillægges
//      ekstra 200 kr." (not online, left out)
//   Opbevaring af værdipapirer i depot:
//     "Transaktionsgebyr ved værdipapirhandel 10 kr." (footnote 2: billed
//     twice a year, in June and December). Footnotes 1 and 3 waive the
//     depot and per-code fees for VP shares, not this one.
//
// One side: max(0.10 % of the order, 29 DKK) + 10 DKK. No maximum.
// Round trip: the Copenhagen book (spreads/book.mjs) + both sides. Denmark
// has no stamp duty or FTT (taxMap.mjs answers 0).
//
// FX: the account is in kroner; the fee list's currency margins are for
// payments, not securities. Every catalogue line trades in DKK; a line in
// another currency would answer N/A.
//
// Left out: limit orders ("Limitering af kursordre pr. stk. 50 kr.", the
// trip is a market order), Lægernes Invest certificates (0 kr., not
// Copenhagen shares), bonds, portfolio management, depot fees (0 for a
// depot holding only VP shares).
//
//   node brokers/lgernes/lgernes_cost.mjs NOVO-B XCSE DKK --shares=25 --price=260
//   node brokers/lgernes/lgernes_cost.mjs DSV XCSE DKK --shares=4 --price=1500
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

const FOLDER = "lgernes";
const BRAND = "Lægernes Bank";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);
const PAGE =
  "https://www.lpb.dk/media/0e1d413b-6ac3-4e9a-b8ec-5c7be09b482b/IlaeTg/Dokumenter/Bank/Priser%20og%20vilk%C3%A5r/Priser/Aktuelle%20gebyrer.pdf";
const READ_ON = "2026-10-26";
const CASH = "DKK";
const RATE = 0.001;
const MIN = 29;
const TX_FEE = 10;

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

// One side, in DKK: netbank courtage + the per-trade transaction fee.
export function commissionEach(notionalDkk) {
  return { courtage: Math.max(MIN, notionalDkk * RATE), tx: TX_FEE };
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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BRAND} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${BRAND}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${BRAND}`,
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
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    basis:
      `liste des frais ${BRAND} (23 octobre 2026) relue le ${READ_ON}, fondshandel via netbank, actions cotées sur Nasdaq : ` +
      `0,10 %, minimum ${MIN} DKK par sens, plus ${TX_FEE} DKK de frais de transaction par achat et par vente`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `ligne en ${listing.currency} : le compte est en DKK et aucun taux de change pour les titres n'est publié` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach(notional);
  const commissionUsd = dollars(each.courtage * 2, CASH);
  const txUsd = dollars(each.tx * 2, CASH);
  const brokerFees = plus(commissionUsd, txUsd);
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
    commission: { rate: RATE, minimum: MIN, currency: CASH, each: each.courtage, txEach: each.tx, eachWay: true },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      transaction: finite(txUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      "frais de transaction de 10 kr. par opération facturés deux fois par an ; les notes 1 et 3 n'exonèrent que les frais de dépôt des actions VP",
      taxTotal ? `taxe à l'achat ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
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
