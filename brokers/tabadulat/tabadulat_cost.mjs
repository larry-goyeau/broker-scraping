// What one round trip costs at Tabadulat (Tabadulat Limited, ADGM, FSRA
// permission 250032): buy n Shariah-screened US shares or ETFs and sell
// them straight back, in dollars. Every line is a dollar line and the
// account is held in dollars (other currencies are converted on arrival,
// before the trade), so nothing is converted on the trip.
//
// https://tabadulat.com/pricing
// read on 2026-10-19:
//   Commission        0% on eligible US stocks and Halal ETFs.
//   Flat trade fee    USD 0.94 "on each trade of less than one whole
//                     share, buying or selling". One whole share or more
//                     pays no flat fee.
//   VAT               UAE residents pay 5% VAT on the flat trade fee and
//                     on custody; non-residents pay none. The account is
//                     an Abu Dhabi one, so the 5% is in the total.
// The terms (https://tabadulat.com/terms-conditions?tab=terms, read the
// same day) name no US broker-dealer: execution goes through a "Third
// Party Agent ... notified to you from time to time". With no dealer
// named, the US book is the quoted NBBO, not a 606 Q. SEC, TAF and CAT
// are not printed and stay at 0.
//
// Left out: custody is 0.25% a year on the portfolio, charged monthly
// (plus 5% VAT for UAE residents), which is not a trade. Deposits are
// free on Tabadulat's side.
//
//   node brokers/tabadulat/tabadulat_cost.mjs HLAL XNAS USD --shares=10 --price=73.334
//   node brokers/tabadulat/tabadulat_cost.mjs HLAL XNAS USD --shares=0.5 --price=73.334
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("tabadulat-parsed.json", import.meta.url);
const PAGE = "https://tabadulat.com/pricing";
const TERMS = "https://tabadulat.com/terms-conditions?tab=terms";
const READ_ON = "2026-10-19";
const FLAT = 0.94;
const VAT = 0.05;
const CASH = "USD";
const REMARK = "Under one share: USD 0.94 plus 5% VAT a trade.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const joinRemarks = (...xs) => xs.map((x) => String(x || "").trim()).filter(Boolean).join(" ");

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
    return { ...answer, why: "le catalogue Tabadulat n'existe pas encore : lancer `node brokers/tabadulat/tabadulat_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Tabadulat` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Tabadulat`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  // No US dealer is named, so spreadLeaf finds no Q for "tabadulat" and the
  // book is the quoted NBBO of the ticker.
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "tabadulat",
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
    remark: joinRemarks(m.row.remark, REMARK),
    listing,
    basis:
      `grille Tabadulat relue le ${READ_ON} : 0 % de commission ; 0,94 $ par ordre de moins d'une action entière, ` +
      `à l'achat et à la vente, plus 5 % de TVA pour un résident des Émirats. Aucun courtier américain nommé : carnet NBBO coté.`,
    confidence: "aucun courtier américain nommé ; SEC, TAF et CAT non publiés, laissés à 0",
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `Tabadulat ne publie un barème qu'en dollars ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const fractional = n < 1;
  const side = fractional ? FLAT * (1 + VAT) : 0;
  const brokerFees = side * 2;
  const taxPct = Object.values(taxRates(taxesOf(listing.isin))).reduce((sum, rate) => sum + rate, 0);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null ? { why: "pas de relevé NBBO pour cette ligne" } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: 0, flat: fractional ? FLAT : 0, vat: VAT, buy: side, sell: side, eachWay: true, currency: CASH },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    sources: { fees: PAGE, terms: TERMS },
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
