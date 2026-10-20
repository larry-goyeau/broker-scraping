// What one round trip costs at SatrixNOW: buy n units of a JSE-listed
// Satrix ETF online and sell them straight back, in dollars. The account
// holds rand only, and every listing it sells is a rand ETF on the JSE, so
// nothing is converted.
//
// http://resources.satrixnow.co.za/satrixnow_Cost_Profile.pdf
// Cost Profile 10.24, the one https://satrix.co.za/platform links, read on
// 2026-10-18. SatrixNOW / TFSA account, each buy and each sell:
//   Brokerage              10 basis points or 0.10% of the rand value
//                          traded (note 1: each transaction, buy or sell).
//   Settlement and admin   0.075% of value traded (note 2: electronic
//                          settlement of whole securities, plus an upfront
//                          recovery on the fractional portion).
//   IPL and admin          0.0002% of value traded (notes 2 and 3: the
//                          regulator's investor protection levy).
//   VAT on costs           15%. The profile prints it once under the table,
//                          so it is put on all three lines above.
//   No minimum and no maximum per trade is printed.
//   No securities transfer tax is named; these are ETFs, and taxMap has no
//   line for them. A GB/IE/FR/IT/ES share with no tax-map line would be
//   N/A (taxGap); none is sold here.
// Left out, in the remark: the platform fee (0.50% a year up to R500 000 of
// aggregated ETF holdings, 0.40% to R1m, 0.30% above), the cash management
// fee on free cash, R50 for a telephone trade, the card deposit charge
// (R1.60 + 2.2%) and the 0.2% early settlement fee. None is a fee on an
// online trade.
//
//   node brokers/satrixnow/satrixnow_cost.mjs STX40 JSE ZAR --shares=10 --price=95
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

const CATALOGUE = new URL("satrixnow-parsed.json", import.meta.url);
const PAGE = "http://resources.satrixnow.co.za/satrixnow_Cost_Profile.pdf";
const READ_ON = "2026-10-18";
const BROKERAGE = 0.001;
const SETTLEMENT = 0.00075;
const IPL = 0.000002;
const VAT = 0.15;
const CASH = "ZAR";
const REMARK =
  "Platform fee 0.50% a year up to R500,000 of ETFs, 0.40% up to R1 million, 0.30% above, charged quarterly.";

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
    return { ...answer, why: "le catalogue SatrixNOW n'existe pas encore : lancer `node brokers/satrixnow/satrixnow_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue SatrixNOW` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez SatrixNOW`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "satrixnow",
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
      `ordre en ligne, Cost Profile SatrixNOW 10.24 relu le ${READ_ON}. ` +
      `Courtage 0,10 %, règlement et administration 0,075 %, IPL 0,0002 %, TVA 15 % sur ces frais, chaque sens. Aucun minimum imprimé.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `SatrixNOW ne publie un barème que pour des ETF en rand ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  // One side, in rand. Brokerage and settlement are Satrix's bill; the IPL
  // is the regulator's levy. VAT goes on all three ("VAT on costs").
  const broker = notional * (BROKERAGE + SETTLEMENT) * (1 + VAT);
  const levy = notional * IPL * (1 + VAT);
  // The cost profile names no STT for ETFs. A line in taxMap would win.
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const stamp = gap ? null : notional * taxPct;
  const brokerFees = dollars(broker * 2, listing.currency);
  const levies = stamp == null ? null : dollars(levy * 2 + stamp, listing.currency);
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
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: (BROKERAGE + SETTLEMENT + IPL) * (1 + VAT),
      sell: (BROKERAGE + SETTLEMENT + IPL) * (1 + VAT),
      brokerage: BROKERAGE,
      settlement: SETTLEMENT,
      ipl: IPL,
      vat: VAT,
      currency: listing.currency,
      sideZar: broker + levy,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(levies, 6),
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
