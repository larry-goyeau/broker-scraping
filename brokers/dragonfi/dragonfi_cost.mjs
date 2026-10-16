// What one round trip costs at DragonFi: buy n shares at price p,
// sell them back at once, in dollars. Online. The pricing calculator
// is the source. A phone order is not on that page.
//
// The fee table, read on 2026-10-15.
//   https://dragonfi.ph/pricing
//   https://api.dragonfi.ph/api/v2/Orders/CalculateInvestmentFees
//
//   commission          0.25% of the gross, each side
//   VAT                 12% of that commission
//   PSE transaction     0.005% of the gross, each side
//   SCCP                0.01% of the gross, each side
//   sales tax           0.1% of the gross, on the sell
// The page prints no floor. A share, a preferred, a REIT and the ETF
// take this one table. Commission and VAT are one line, the PSE fee
// and the SCCP fee are one line, and the sales tax is its own line.
// Each of those three lines is raised to the next centavo. An exact
// centavo stays. A fund is free and is not this order. An IPO buy can
// be waived, and that waiver stays out. The account is funded in
// pesos. The page prints no foreign-exchange margin.
//
//   node brokers/dragonfi/dragonfi_cost.mjs SM PSE PHP --shares=20000 --price=5
//   node brokers/dragonfi/dragonfi_cost.mjs AETF PSE PHP --shares=100 --price=97
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("dragonfi-parsed.json", import.meta.url);
const PAGE = "https://dragonfi.ph/pricing";
const READ_ON = "2026-10-15";
const COMMISSION = 0.0025;
const VAT = 0.12;
const PSE_FEE = 0.00005;
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

// The calculator's gross is already in centavos. A binary product such
// as 1.11 × 3 is put back on that centavo before the rates.
function peso(amount) {
  return Math.round(amount * 100 + Number.EPSILON) / 100;
}

// Each printed line is raised to the next centavo. An amount that is
// already a whole centavo is left as it is.
function ceilCent(amount) {
  const scaled = amount * 100;
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) < 1e-6) return nearest / 100;
  return Math.ceil(scaled - 1e-9) / 100;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
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
  const gross = peso(notional);
  const commission = gross * COMMISSION;
  const vat = commission * VAT;
  const commissionVat = ceilCent(commission + vat);
  const market = ceilCent(gross * PSE_FEE + gross * SCCP);
  const salesTax = ceilCent(gross * SALES_TAX);
  const side = peso(commissionVat + market);
  return { commissionVat, market, salesTax, side, sell: peso(side + salesTax) };
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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue DragonFi n'existe pas encore : lancer `node brokers/dragonfi/dragonfi_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue DragonFi` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez DragonFi`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "dragonfi",
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
    basis: `DragonFi en ligne, barème relu le ${READ_ON}. Commission 0,25 % plus TVA 12 % de la commission, frais PSE 0,005 %, SCCP 0,01 %, taxe de vente 0,1 % à la vente. Chaque ligne est portée au centime supérieur.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const fees = ticket(notional);
  const local = peso(fees.side + fees.sell);
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
    commission: { rate: COMMISSION, vat: VAT, buy: fees.side, sell: fees.sell, salesTax: SALES_TAX, currency: listing.currency },
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
