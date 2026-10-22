// What one round trip costs at Atlass Portfolios through CITITRADER, its
// online platform: buy n shares (or ETF units) on the Nigerian Exchange and
// sell them straight back, in dollars. Every catalogue line is a naira line
// and the account is held in naira, so nothing is converted.
//
// https://atlassportfolios.com/
// read on 2026-10-21. The homepage banner, linked to the CITITRADER sign-in:
//   "0.4% Buy 0.6% Sell Brokerage Commission"
//   "CITITRADER offers the cheapest brokerage commission when you buy and
//   sell shares."
// The figures are brokerage only. They cannot be all-in: the statutory card
// alone is 0.40 % on a buy and 0.73 % on a sell before any brokerage. The
// page prints no minimum and no date.
//
// The statutory card is the exchange's own, re-read the same day
// (https://ngxgroup.com/exchange/trade/equities/trading-market-structure/):
//   Buy     SEC 0.3 %, stamp duty 0.08 %, trade alert ₦4
//           VAT 7.5 % of brokerage and SEC fee
//   Sell    NGX 0.3 %, CSCS 0.3 %, stamp duty 0.08 %, trade alert ₦4
//           VAT 7.5 % of NGX, CSCS and brokerage
// brokerFees is the brokerage and the VAT on it; the SEC, NGX, CSCS lines,
// the VAT on them, stamp duty and the alerts are in usd, not in brokerFees.
// One execution a side is assumed (one alert each).
// The Nigerian book is read from spreads/ as in brokers/stanbicibtc; a
// missing book stays missing.
//
//   node brokers/atlass/atlass_cost.mjs DANGCEM NGX NGN --shares=10 --price=1008
//   node brokers/atlass/atlass_cost.mjs STANBICETF30 NGX NGN --shares=100 --price=500
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("atlass-parsed.json", import.meta.url);
const PAGE = "https://atlassportfolios.com/";
const NGX_PAGE = "https://ngxgroup.com/exchange/trade/equities/trading-market-structure/";
const READ_ON = "2026-10-21";
const BROKER = "Atlass";
const BUY = 0.004;
const SELL = 0.006;
const SEC = 0.003;
const NGX = 0.003;
const CSCS = 0.003;
const STAMP = 0.0008;
const ALERT = 4;
const VAT = 0.075;
const CASH = "NGN";
const REMARK = "";

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
      return loose(m.row.exchange) === wantPlace;
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
    cashCurrency: CASH,
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/atlass/atlass_scraping.mjs\`` };
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
    broker: "atlass",
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
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    basis:
      `courtage CITITRADER relu le ${READ_ON} sur la page d'accueil Atlass : 0,4 % à l'achat, 0,6 % à la vente, ` +
      `TVA 7,5 % en sus. Barème NGX relu le même jour : achat SEC 0,3 %, vente NGX 0,3 % et CSCS 0,3 %, ` +
      `TVA 7,5 % sur ces frais, droit de timbre 0,08 % et alerte 4 ₦ chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, market: NGX_PAGE },
  };
  if (listing.currency !== CASH || listing.mic !== "XNGN") {
    return { ...shared, why: `${BROKER} ne publie un barème que pour le Nigerian Exchange en naira ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buyBrokerage = notional * BUY;
  const sellBrokerage = notional * SELL;
  const commission = (buyBrokerage + sellBrokerage) * (1 + VAT);
  const buyLevies = notional * (SEC * (1 + VAT) + STAMP) + ALERT;
  const sellLevies = notional * ((NGX + CSCS) * (1 + VAT) + STAMP) + ALERT;
  const brokerFees = dollars(commission, listing.currency);
  const levies = dollars(buyLevies + sellLevies, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: BUY,
      sell: SELL,
      vat: VAT,
      buyNgn: buyBrokerage * (1 + VAT),
      sellNgn: sellBrokerage * (1 + VAT),
      currency: listing.currency,
    },
    market: { buyNgn: buyLevies, sellNgn: sellLevies, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(levies, 6),
      courtageNgn: finite(commission, 6),
      réglementaireNgn: finite(buyLevies + sellLevies, 6),
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
