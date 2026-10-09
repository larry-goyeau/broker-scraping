// What one round trip costs at Nordnet Sweden: buy n shares at price p,
// sell them back at once, in dollars. The online ticket, in the app or
// on nordnet.se. Phone orders are a different ticket and are not this one.
//
// Price list read on 2026-10-08. The account picks Mini, Liten, Mellan
// or Fast and can change it, so the bill is the cheapest of the four
// for this order. Active Trading and Private Banking need their own
// agreement and stay out. The jubilee (no Nordic commission for customers
// who join by 31 Dec 2026, through 30 Jun 2027, up to 10 million SEK)
// is not this number.
//
//   Stockholm and First North Sweden
//     Mini 0.25 % floor 1, Liten 0.15 % floor 39,
//     Mellan 0.069 % floor 69, Fast 99 flat. SEK.
//   Helsinki, Copenhagen, Oslo, and their First North, Expand and Growth
//     same floors, Mellan 0.07 %, Fast 99 flat.
//   Spotlight, NGM, Nordic SME
//     Mini 0.25 % floor 19, Liten 0.15 % floor 39,
//     Mellan 0.069 % floor 69, Fast 0.045 % floor 99.
//   Everywhere else on the list, including the US, Canada and Europe
//     Mini 0.25 % floor 9, Liten 0.15 % floor 49,
//     Mellan 0.089 % floor 69, Fast 0.079 % floor 99.
//   The percentage is of the order in SEK. The floor is in SEK.
//   Shares and ETFs use the same table. London, Zurich, Milan, Madrid
//   and Vienna are priced on this outside table: the order is read on
//   the national book, not on the CBOE Europe quote the page shows.
//
// A SEK line does not convert. USD, EUR, NOK, DKK and CAD have a free
// currency account, so that exchange is not in the total. The remark
// is `FX 0.25% when cash ≠ CCY`. Exchanging yourself then costs
// 0.075 %, which is not this trip. Any other currency, including GBP
// and CHF, converts automatically at 0.25 % each way, and that is in
// the total, so it is not repeated in the remark.
//
//   https://www.nordnet.se/kundservice/prislista
//   https://www.nordnet.se/faq/handel-vardepapper/valutakonto/hur-fungerar-valutavaexling-och-vad-kostar-det
//
//   node brokers/nordnet/nordnet_cost.mjs INVEB XSTO SEK --shares=10 --price=400
//   node brokers/nordnet/nordnet_cost.mjs AAPL XNAS USD --shares=1 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("nordnet-parsed.json", import.meta.url);
const PAGE = "https://www.nordnet.se/kundservice/prislista";
const READ_ON = "2026-10-08";
const CASH = "SEK";
const FX_AUTO = 0.0025;
const FX_ACCOUNT = new Set(["USD", "EUR", "NOK", "DKK", "CAD"]);

// Stockholm and Swedish First North. Fast is a flat 99, not a percentage.
const SE = [
  { rate: 0.0025, min: 1 },
  { rate: 0.0015, min: 39 },
  { rate: 0.00069, min: 69 },
  { flat: 99 },
];
// Helsinki, Copenhagen, Oslo. Mellan is 0.07 %, a hair above Stockholm.
const NORDIC = [
  { rate: 0.0025, min: 1 },
  { rate: 0.0015, min: 39 },
  { rate: 0.0007, min: 69 },
  { flat: 99 },
];
// Spotlight, NGM, Nordic SME. The floor starts at 19, and Fast is a percentage.
const SMALL = [
  { rate: 0.0025, min: 19 },
  { rate: 0.0015, min: 39 },
  { rate: 0.00069, min: 69 },
  { rate: 0.00045, min: 99 },
];
// The table the price list hangs on the US, Canada and every European
// market outside the Nordics.
const OUTSIDE = [
  { rate: 0.0025, min: 9 },
  { rate: 0.0015, min: 49 },
  { rate: 0.00089, min: 69 },
  { rate: 0.00079, min: 99 },
];

const SCHEDULE = {
  XSTO: SE,
  SSME: SE,
  XHEL: NORDIC,
  FSME: NORDIC,
  XCSE: NORDIC,
  DSME: NORDIC,
  XOSL: NORDIC,
  XOAS: NORDIC,
  MERK: NORDIC,
  XSAT: SMALL,
  SPDK: SMALL,
  SPNO: SMALL,
  XNGM: SMALL,
  NSME: SMALL,
  US: OUTSIDE,
  XNAS: OUTSIDE,
  XNYS: OUTSIDE,
  ARCX: OUTSIDE,
  XASE: OUTSIDE,
  BATS: OUTSIDE,
  OTCM: OUTSIDE,
  XTSE: OUTSIDE,
  XTSX: OUTSIDE,
  XTNX: OUTSIDE,
  XLON: OUTSIDE,
  XSWX: OUTSIDE,
  XETR: OUTSIDE,
  XPAR: OUTSIDE,
  XAMS: OUTSIDE,
  XBRU: OUTSIDE,
  XLIS: OUTSIDE,
  XDUB: OUTSIDE,
  XMIL: OUTSIDE,
  XMAD: OUTSIDE,
  XWBO: OUTSIDE,
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function toSek(amount, currency) {
  if (code(currency) === CASH) return Number(amount);
  const usd = toUsd(amount, currency);
  const per = usdPer(CASH);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

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

// The cheapest of the four classes, in SEK, for this order.
export function cheapestClass(schedule, notionalSek) {
  if (!schedule || notionalSek == null) return null;
  let best = null;
  for (const rule of schedule) {
    const fee = rule.flat != null ? rule.flat : Math.max(rule.min, notionalSek * rule.rate);
    if (!best || fee < best.fee) best = { ...rule, fee };
  }
  return best;
}

function converts(currency) {
  return currency !== CASH && !FX_ACCOUNT.has(currency);
}

function remarkOf(currency) {
  if (currency === CASH || converts(currency)) return "";
  return fxRemark((100 * FX_AUTO).toFixed(2), currency);
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
    return { ...answer, why: "le catalogue Nordnet n'existe pas encore : lancer `node brokers/nordnet/nordnet_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Nordnet` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Nordnet`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  // A listed American line is the national best bid and offer. The 605
  // figure is that tape, whichever of the five books happens to hold it.
  const listedUs = code(m.row.exchange) === "US" && code(m.row.currency) === "USD";
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? (listedUs ? "XNAS" : null),
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "nordnet",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: listedUs ? null : book.mic ?? m.venue?.mic ?? null,
    exchange: listedUs ? "US" : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const schedule = SCHEDULE[code(m.row.exchange)];
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    remark: remarkOf(listing.currency),
    basis: `Nordnet Suède, barème relu le ${READ_ON}. La classe la moins chère des quatre.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!schedule) return { ...shared, why: `pas de courtage publié pour ${listing.exchange}` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalSek = toSek(notional, listing.currency);
  const notionalUsd = dollars(notional, listing.currency);
  const chosen = cheapestClass(schedule, notionalSek);
  if (!chosen || notionalUsd == null) return { ...shared, why: "pas de cours pour ramener l'ordre en couronnes" };

  const ticket = chosen.fee * 2;
  const commissionUsd = dollars(ticket, CASH);
  const fxUsd = converts(listing.currency) ? notionalUsd * FX_AUTO * 2 : 0;
  const brokerFees = plus(commissionUsd, fxUsd);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const taxUsd = notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: listedUs ? { source: "us605" } : m.venue,
    unsourced: listedUs ? null : m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: listedUs ? "pas de relevé NBBO pour cette ligne" : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      each: chosen.fee,
      eachWay: true,
      currency: CASH,
      rate: chosen.flat != null ? 0 : chosen.rate,
      min: chosen.min || 0,
      flat: chosen.flat ?? null,
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
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(arg("shares", "10")),
        price: Number(arg("price", "0")),
      }),
      null,
      2
    )
  );
}

printCli();
