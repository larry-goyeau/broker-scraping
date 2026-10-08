// What one round trip costs at Arion: buy n shares at price p,
// sell them back at once, in dollars. The online Icelandic book,
// placed in the app or the netbank.
//
// Securities tariff, in force 1 May 2026, read on 2026-10-07:
//   listed domestic shares, app or netbank   0.75% of the fill
//   processing fee, shares in the app        300 ISK, each trade
//   domestic commission floor                 none in the app or netbank
//   minimum purchase                          20,000 ISK, not a ticket
// The same page prices listed domestic and foreign shares at 1%
// outside that channel, with a 4,000 ISK domestic floor. The product
// page's 25% app discount is that gap (1% × 0.75), so it is not
// applied again. Custody is 0.03% a year, minimum 4,000 ISK, billed
// on the portfolio, and stays off the ticket. No separate exchange
// fee is printed.
//
// The worked example for a listed domestic share in the app matches:
// 500,000 ISK costs 8,100 ISK in and out (0.75% twice, plus 300 twice).
// An ETF in this catalogue is an order on the same Icelandic book,
// and no other online rate is printed, so it takes the same two
// figures. First North is listed domestic on that line.
//
//   https://docs.arionbanki.is/themes/arionbanki/arionbanki/documents/05_Bankinn/Fleira/Vextir-og-verdskra/Verdskra/Verdskra-VL.pdf
//   https://www.arionbanki.is/einstaklingar/sparnadur/verdbref-einstaklingar
//
//   node brokers/arion/arion_cost.mjs ARION XICE ISK --shares=1000 --price=100
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("arion-parsed.json", import.meta.url);
const PAGE =
  "https://docs.arionbanki.is/themes/arionbanki/arionbanki/documents/05_Bankinn/Fleira/Vextir-og-verdskra/Verdskra/Verdskra-VL.pdf";
const READ_ON = "2026-10-07";
const RATE = 0.0075;
const HANDLING = 300;

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

function side(notional) {
  return notional * RATE + HANDLING;
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
    cashCurrency: "ISK",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Arion n'existe pas encore : lancer `node brokers/arion/arion_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Arion` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Arion`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "arion",
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
    cashCurrency: "ISK",
    basis: `ordre en ligne, barème relu le ${READ_ON}. 0,75 % par ordre plus 300 ISK, sans minimum.`,
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
  const each = side(notional);
  const ticket = each * 2;
  const brokerFees = dollars(ticket, listing.currency);
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
    commission: { rate: RATE, handling: HANDLING, each, eachWay: true, currency: listing.currency },
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
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  }), null, 2));
}

printCli();
