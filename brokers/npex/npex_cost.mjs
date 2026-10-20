// What one round trip costs on NPEX: buy n units (shares, share
// certificates or fund units) at price p on the NPEX exchange, sell them
// back at once, in dollars. NPEX is a Dutch MTF; the catalogue is its
// tradable order books. Bonds and new issues are not this trip.
//
// Investor tariffs read on 2026-10-18 (page last updated 2026-08-27).
//   https://www.npex.nl/beleggen/tarieven/
//
//   Transactiekosten   0.5 % per transaction on the NPEX exchange, the buy
//                      and the sale each being one. The fixed 2.50 €
//                      minimum was dropped on 3-4-2023; some older
//                      per-issue pages (ZEPCAM) still print it.
//   Open-end funds     trade free of charge.
//   Account            the NPEX account, deposits and withdrawals are free.
//                      Cash is held in euros only (deposits.mjs), and every
//                      line is in euros, so nothing converts.
//   Servicekosten      0.05 % a month on bonds and cumulative preference
//                      certificates (issues from 1-9-2016). Subscription to
//                      an issue 1 %. Conversion / exercise 5 € + 1 %, max
//                      1 000 €. Not this trip.
//   Taxes              none named.
//
// A per-issue tariff page can depart from the general one; the general page
// is what is priced. No bid/ask tape for NPEX is read here, so the total is
// N/A for want of a book, while `brokerFees` carries the charge.
//
//   node brokers/npex/npex_cost.mjs NL0000204352 NPEX EUR --shares=10 --price=50
//   node brokers/npex/npex_cost.mjs "DD Equity Fund" NPEX EUR --shares=10 --price=100
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("npex-parsed.json", import.meta.url);
const PAGE = "https://www.npex.nl/beleggen/tarieven/";
const READ_ON = "2026-10-18";
const CASH = "EUR";
const RATE = 0.005;
const OPEN_END = /open-end fonds/i;

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
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(
    rows,
    asked,
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked || loose(r.name) === asked
  );
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || loose(m.venue?.mic) === wantPlace)
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
    cashCurrency: CASH,
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue NPEX n'existe pas encore : lancer `node brokers/npex/npex_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue NPEX` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez NPEX`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "npex",
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
  const openEnd = OPEN_END.test(m.row.raw || "");
  const rate = openEnd ? 0 : RATE;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: openEnd
      ? `tarifs NPEX relus le ${READ_ON} : fonds open-end, négociation sans frais`
      : `tarifs NPEX relus le ${READ_ON} : 0,5 % par transaction, à l'achat et à la vente, sans minimum depuis le 3-4-2023`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${listing.ticker || etf} est coté en ${listing.currency} : NPEX ne traite qu'en euros` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : le carnet NPEX n'est pas dans assets/prices.json" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * rate;
  const brokerFees = dollars(each * 2, CASH);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "le carnet NPEX n'est pas relevé"}` }
      : {}),
    commission: { rate, each, currency: CASH, eachWay: true, openEnd },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      change: 0,
      taxes: 0,
    },
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
