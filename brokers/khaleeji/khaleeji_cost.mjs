// What one round trip costs at Khaleeji Bank (Bahrain) through Khaleeji
// eTrade, the Mubasher platform: buy n shares on Bahrain Bourse and sell
// them straight back, in dollars.
//
// "Service Charges" (AUG2026SC, the file named SEP26B), read on 2026-10-23:
//   "E-trade charges through Mubasher: Minimum BD 3 or 0.20% of the trade
//   amount whichever is higher (Including BD 2 for Bahrain Bourse)"
// Each trade, so each side: max(BD 3, 0.20 %). The bourse's share is inside
// the figure. The line carries neither VAT marker of the sheet ("1" VAT
// included, "2" not subject); the sheet says "VAT is included where
// applicable", so the printed figure is the whole charge.
//
// Currency. The account is in dinars only (deposits.mjs). A dinar line is
// paid as it is. Six titles trade in dollars (ABC, ARIG, GFH, INOVEST,
// ITHMR, KFH): their cash is a forced conversion from dinars on the buy
// and back on the sell, at the bank's "Tasaruf" rate, which is not printed.
// Those totals stay N/A; the commission is still given.
//   https://khaleeji.bank/wp-content/uploads/2026/09/Khaleeji-Service-Charges-SEP26B.pdf
//   https://khaleeji.bank/pages-sidebar-nav/khaleeji-etrade/
//
// Left out: no custody, account or eTrade subscription fee is printed.
// Bahrain Bourse's book comes from spreads/gulf.mjs when it has a leaf;
// without one the total is N/A.
//
//   node brokers/khaleeji/khaleeji_cost.mjs BBK XBAH BHD --shares=1500 --price=0.5
//   node brokers/khaleeji/khaleeji_cost.mjs GFH XBAH USD --shares=2500 --price=0.4
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("khaleeji-parsed.json", import.meta.url);
const PAGE = "https://khaleeji.bank/wp-content/uploads/2026/09/Khaleeji-Service-Charges-SEP26B.pdf";
const READ_ON = "2026-10-23";
const RATE = 0.002;
const MIN_BHD = 3;
const CASH = "BHD";
const REMARK = "";

// One side, in the listing currency; on a dollar line the BD 3 floor is
// converted through fx.mjs.
function side(notional, currency) {
  const floor = currency === CASH ? MIN_BHD : toUsd(MIN_BHD, CASH) / (usdPer(currency) ?? NaN);
  return Math.max(floor, notional * RATE);
}

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
    return { ...answer, why: "le catalogue Khaleeji n'existe pas encore : lancer `node brokers/khaleeji/khaleeji_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Khaleeji eTrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Khaleeji eTrade`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "khaleeji",
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
      `barème Khaleeji relu le ${READ_ON} : eTrade (Mubasher) 0,20 % par opération, minimum 3 BHD, ` +
      `part de Bahrain Bourse comprise, chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const forced = listing.currency !== CASH;
  const commissionLocal = side(notional, listing.currency) * 2;
  const brokerFees = dollars(commissionLocal, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  // A dollar line converts dinars at a rate the bank does not print.
  const usd = forced ? null : plus(bookUsd, brokerFees);
  const why =
    usd != null
      ? null
      : forced
        ? `ligne en ${listing.currency} : le compte est en dinars et le change (« Tasaruf ») n'est pas imprimé`
        : notionalUsd == null
          ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
          : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: RATE, minPerTrade: MIN_BHD, minCurrency: CASH, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      change: forced ? null : 0,
      courtageLocal: finite(commissionLocal, 6),
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
