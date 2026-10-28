// What one round trip costs at Frøslev-Mollerup Sparekasse: buy n shares on
// Nasdaq Copenhagen in the netbank and sell them straight back, in dollars.
// The catalogue is the Copenhagen main market book (copenhagenBook.mjs).
//
// Price book read on 2026-10-26 ("Prisbog pr. 01. marts 2026"):
//   https://www.fmspks.dk/media/phvlew21/prisbog_fmspks_01032026.pdf
//   Handel via netbank, Kurtage:
//     "Danske aktier og investeringsbeviser – kurtage af kursværdi
//      0,15% - min. 38 kr."
//   (the adviser rate, "Danske aktier og investeringsforeningsbeviser",
//    0.75% min. 200 kr. max. 500 kr. below 100,000 kr., is not online)
//   Depotgebyrer, VP gebyr:
//     "Meddelelse om beholdningsændring (Ved køb og salg eller konto til
//      konto-overførsel) 24 kr." and "Transaktionsgebyr beregnes pr. stk.
//      24 kr." Read as one 24 kr. fee per trade (one notice of the holding
//     change per buy and per sale), not two.
//   "I henhold til gældende lov dækker aktieselskaber m.fl. de
//    opbevaringsomkostninger, der er for aktier": no custody on the shares.
//
// One side: max(0.15 % of the order, 38 DKK) + 24 DKK. No maximum.
// Round trip: the Copenhagen book (spreads/book.mjs) + both sides. Denmark
// has no stamp duty or FTT (taxMap.mjs answers 0).
//
// FX: the account is in kroner and the price book prints no currency
// account and no FX margin for securities. Every catalogue line trades in
// DKK; a line in another currency would answer N/A.
//
// Left out: limit orders (125 kr. per 14 days, an agreed order with the
// adviser), foreign shares (0.75 % min. 500 kr. in the netbank, not in
// the catalogue), bonds, VP account and code fees, which are 0 for an
// account holding only shares or charged once a year.
//
//   node brokers/frslevmollerupsp/frslevmollerupsp_cost.mjs NOVO-B XCSE DKK --shares=25 --price=260
//   node brokers/frslevmollerupsp/frslevmollerupsp_cost.mjs DSV XCSE DKK --shares=4 --price=1500
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

const FOLDER = "frslevmollerupsp";
const BRAND = "Frøslev-Mollerup Sparekasse";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);
const PAGE = "https://www.fmspks.dk/media/phvlew21/prisbog_fmspks_01032026.pdf";
const READ_ON = "2026-10-26";
const CASH = "DKK";
const RATE = 0.0015;
const MIN = 38;
const VP_FEE = 24;

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

// One side, in DKK: netbank courtage + the VP notice of the holding change.
export function commissionEach(notionalDkk) {
  return { courtage: Math.max(MIN, notionalDkk * RATE), vp: VP_FEE };
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
      `prisbog ${BRAND} (1er mars 2026) relu le ${READ_ON}, handel via netbank, actions danoises : ` +
      `0,15 %, minimum ${MIN} DKK par sens, plus ${VP_FEE} DKK de frais VP (avis de mouvement) par achat et par vente`,
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
  const vpUsd = dollars(each.vp * 2, CASH);
  const brokerFees = plus(commissionUsd, vpUsd);
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
    commission: { rate: RATE, minimum: MIN, currency: CASH, each: each.courtage, vpEach: each.vp, eachWay: true },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      vp: finite(vpUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      "les deux lignes VP de 24 kr. (avis de mouvement « ved køb og salg » et « transaktionsgebyr pr. stk. ») sont lues comme un seul frais par opération",
      "garde des actions à la charge des émetteurs selon le prisbog",
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
