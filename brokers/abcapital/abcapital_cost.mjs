// What one round trip costs at AB Capital: buy n shares at price p,
// sell them back at once, in dollars. The online cash account. A
// hotline order is 1.5% instead of 0.25%, and it stays out. Margin
// stays out. The FAQ prints one table. A share and the ETF take it.
//
// The fee answers, read on 2026-10-05:
//   commission          0.25% of the gross, or 20 pesos, each side
//   VAT                 12% of that commission
//   PSE / transaction   0.005% of the gross, each side
//   SCCP                0.01% of the gross, each side
//   stock transaction   0.1% of the gross, on the sell
// The worked example is 1,000 BPI at 50 pesos: buy 147.50, sell
// 197.50. The page prints no rounding rule. The board lot is a
// quantity, not a charge.
//
// PDTC custodianship is a pass-through on the market value, billed
// monthly. The page prints no rate, so it stays in the remark. There
// is no monthly fee from AB Capital itself. A certificate is not this
// order. The 20 peso floor is in pesos, so a line in another currency
// is not priced here.
//
//   https://securities.abcapitalonline.com/frequently-asked-questions/
//
//   node brokers/abcapital/abcapital_cost.mjs BPI PSE PHP --shares=1000 --price=50
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("abcapital-parsed.json", import.meta.url);
const PAGE = "https://securities.abcapitalonline.com/frequently-asked-questions/";
const READ_ON = "2026-10-05";
const COMMISSION = 0.0025;
const MIN = 20;
const VAT = 0.12;
const TRANSACTION = 0.00005;
const SCCP = 0.0001;
const SALES_TAX = 0.001;

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

function ticket(notional) {
  const commission = Math.max(notional * COMMISSION, MIN);
  const vat = commission * VAT;
  const transaction = notional * TRANSACTION;
  const sccp = notional * SCCP;
  const side = commission + vat + transaction + sccp;
  return { commission, vat, transaction, sccp, side, sell: side + notional * SALES_TAX };
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
    cashCurrency: "PHP",
    url: PAGE,
    remark: "PDTC custodianship is billed monthly on the market value of the holdings. The page prints no rate.",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue AB Capital n'existe pas encore : lancer `node brokers/abcapital/abcapital_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue AB Capital` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez AB Capital`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "abcapital",
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
    cashCurrency: listing.currency || "PHP",
    basis: `AB Capital en ligne, barème relu le ${READ_ON}. Commission 0,25 % ou 20 pesos, plus TVA 12 % de la commission, frais PSE 0,005 %, SCCP 0,01 %, taxe de vente 0,1 % à la vente.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  if (listing.currency !== "PHP") {
    return { ...shared, why: `${listing.ticker || etf} est coté en ${listing.currency} : le plancher de 20 pesos n'a pas de conversion imprimée` };
  }

  const notional = n * p;
  const fees = ticket(notional);
  const local = fees.side + fees.sell;
  const notionalUsd = dollars(notional, listing.currency);
  const brokerFees = dollars(local, listing.currency);
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
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      rate: COMMISSION,
      min: MIN,
      vat: VAT,
      buy: fees.side,
      sell: fees.sell,
      salesTax: SALES_TAX,
      currency: listing.currency,
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
