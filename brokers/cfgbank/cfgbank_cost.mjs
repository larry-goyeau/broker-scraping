// What one round trip costs at CFG Bank: buy n shares, sell them
// back, in dollars. Online order on a listed Casablanca share.
//
// https://www.cfgbank.com/wp-content/uploads/2024/01/LIVRET-TARIFICATION-JANVIER-2024.pdf
// read on 2026-10-06. The booklet is the January 2024 edition, still
// the file linked from the tariff page. One block covers a buy or a
// sell of a share listed in Casablanca.
//   Brokerage, before tax   0.4 % to 0.6 % of the gross, minimum 5 MAD.
//                           With the 10 % tax the column prints 0.44 %
//                           to 0.66 %, minimum 5.5 MAD.
//   Settlement, before tax  0.10 % to 0.20 %, minimum 5 MAD. With the
//                           tax, 0.11 % to 0.22 %, minimum 5.50 MAD.
//   Bourse tax              0.10 % before tax, 0.11 % in the tax-included
//                           column.
//   The forfait columns do not replace these bands. The ticket uses
//   the top of each tax-included band. The booklet prints no custody
//   rate for a listed share.
//   Casablanca              no book is published here
//
//   node brokers/cfgbank/cfgbank_cost.mjs ADH Casablanca MAD --shares=10 --price=30
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("cfgbank-parsed.json", import.meta.url);
const PAGE = "https://www.cfgbank.com/wp-content/uploads/2024/01/LIVRET-TARIFICATION-JANVIER-2024.pdf";
const READ_ON = "2026-10-06";
const BROKERAGE = 0.0066;
const BROKERAGE_MIN = 5.5;
const SETTLEMENT = 0.0022;
const SETTLEMENT_MIN = 5.5;
const BOURSE_TAX = 0.0011;

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

function leg(notional) {
  return (
    Math.max(notional * BROKERAGE, BROKERAGE_MIN) +
    Math.max(notional * SETTLEMENT, SETTLEMENT_MIN) +
    notional * BOURSE_TAX
  );
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
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue CFG Bank n'existe pas encore : lancer `node brokers/cfgbank/cfgbank_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue CFG Bank` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez CFG Bank`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "cfgbank",
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
    cashCurrency: listing.currency,
    basis:
      `livraison en ligne, livret de janvier 2024 relu le ${READ_ON}. ` +
      `Haut de la fourchette TTC : courtage 0,66 % min 5,5 MAD, règlement 0,22 % min 5,50 MAD, impôt de bourse 0,11 %, chaque sens.`,
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
  const one = leg(notional);
  const brokerFees = dollars(one + one, listing.currency);
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
    commission: { buy: BROKERAGE + SETTLEMENT + BOURSE_TAX, sell: BROKERAGE + SETTLEMENT + BOURSE_TAX, currency: listing.currency },
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
