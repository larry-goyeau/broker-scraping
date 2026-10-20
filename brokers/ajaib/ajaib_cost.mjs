// What one round trip costs at Ajaib: buy n shares at price p, sell
// them back at once, in dollars. The buy is a market order. The sell
// is a forced sale.
//
// Indonesian shares and the exchange-traded funds on that book, read
// on 2026-10-14.
//   https://ajaib.co.id/biaya
//   https://ajaib.co.id/saham
//   Buy    0.1513% of the fill, plus 0.10% for a market order.
//   Sell   0.2513% of the fill, plus 0.25% for a forced sale.
//   The two base figures already include the broker fee, the levy
//   (BEI, KPEI, KSEI) and VAT on the broker fee. The sell figure also
//   includes the 0.10% final income tax on a sale.
//
// United States shares and the exchange-traded funds on that book.
//   https://ajaib.co.id/saham-amerika
//   0.30% of the fill on a buy and on a sell. The page prints one rate
//   for both transactions and says it already includes the broker fee
//   and VAT. It prints no SEC, TAF or CAT line. A dollar balance avoids
//   a conversion.
//   Ajaib files no Rule 606. Alpaca names it as a long-time partner for
//   US stocks and ETFs, so the book is the 605 times Alpaca's Q (the
//   "ajaib" alias in spreads/rule606.mjs).
//   https://alpaca.markets/blog/how-ajaib-is-empowering-indonesian-investors-with-us-options-trading/
//
//   node brokers/ajaib/ajaib_cost.mjs BBCA IDX IDR --shares=10 --price=6000
//   node brokers/ajaib/ajaib_cost.mjs AAPL US USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("ajaib-parsed.json", import.meta.url);
const READ_ON = "2026-10-14";
const ID_PAGE = "https://ajaib.co.id/biaya";
const US_PAGE = "https://ajaib.co.id/saham-amerika";
const ID_BUY = 0.001513 + 0.001;
const ID_SELL = 0.002513 + 0.0025;
const US_RATE = 0.003;
const US_REMARK = "FX when cash ≠ USD.";

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
  const named = rowsNamed(
    rows,
    asked,
    (r) =>
      loose(r.isin) === asked ||
      loose(r.ticker) === asked ||
      loose(r.query) === asked ||
      (Array.isArray(r.matches) && r.matches.some((item) => loose(item) === asked))
  );
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
    cashCurrency: "",
    url: ID_PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Ajaib n'existe pas encore : lancer `node brokers/ajaib/ajaib_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Ajaib` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Ajaib`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "ajaib",
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
  const american = loose(listing.brokerExchange) === "US";
  const indonesian = loose(listing.brokerExchange) === "IDX";
  const quoted = american ? usBookPerShare({ broker: "ajaib", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const buy = american ? US_RATE : ID_BUY;
  const sell = american ? US_RATE : ID_SELL;
  const shared = {
    ...answer,
    url: american ? US_PAGE : ID_PAGE,
    listing,
    cashCurrency: listing.currency,
    remark: american ? US_REMARK : "",
    basis: american
      ? `livraison en ligne, page relue le ${READ_ON}. 0,30 % de chaque côté, courtage et TVA compris.`
      : `livraison en ligne, barème relu le ${READ_ON}. Achat 0,2513 % (0,1513 % plus 0,10 % d'ordre au marché). Vente 0,5013 % (0,2513 % plus 0,25 % de vente forcée).`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!american && !indonesian) return { ...shared, why: `${listing.brokerExchange} n'a pas de barème Ajaib` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const brokerFees = dollars(notional * (buy + sell), listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: american && marketPerShare != null ? null : m.unsourced,
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
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy, sell, currency: listing.currency },
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
