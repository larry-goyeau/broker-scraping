// What one round trip costs at ACRO verðbréf: buy n shares at price p,
// sell them back at once, in dollars. The Icelandic book, placed in the
// ACRO app.
//
// Price list in force 16 April 2026, read on 2026-10-26:
//   listed domestic shares in the ACRO app   0.65% of the fill, minimum 1,750 ISK
//     "Kaup- og söluþóknun með skráð hlutabréf í Acro appinu 0,65% 1.750kr"
//   processing fee, buy or sell in the app   750 ISK, each trade
//     "Afgreiðslugjald vegna kaupa og sölu verðbréfa og sjóða í appinu 750kr"
// Outside the app the same list prices listed securities at 1.0%,
// minimum 5,000 ISK ("skráð bréf 1,0% 5.000kr"), with a 1,250 ISK
// processing fee. The app is for trading "hlutabréf í Kauphöll Íslands"
// (shares), so the one ETF in this catalogue (LEQ) is taken at that
// 1.0% + 1,250 ISK rate and marked onlineBuy: false (an order through
// the desk, not the app).
// Custody is 0.15% a year, charged monthly ("Vörsluþóknun ... 0,15%"),
// and stays off the ticket (remark). The list's "third-party costs may
// apply" line names no figure, so nothing is added; no separate exchange
// fee is printed.
//
//   https://acro.is/wp-content/uploads/2026/04/5.01-Reglubok-ACRO-Gjaldskra.pdf
//   https://acro.is/app/
//
//   node brokers/acro/acro_cost.mjs ARION XICE ISK --shares=800 --price=175
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("acro-parsed.json", import.meta.url);
const PAGE = "https://acro.is/wp-content/uploads/2026/04/5.01-Reglubok-ACRO-Gjaldskra.pdf";
const READ_ON = "2026-10-26";
// App: listed domestic shares. Desk: any other listed domestic security.
const APP = { rate: 0.0065, minimum: 1750, handling: 750 };
const DESK = { rate: 0.01, minimum: 5000, handling: 1250 };
const REMARK = "Custody 0.15% a year.";

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

function side(notional, fee) {
  return Math.max(notional * fee.rate, fee.minimum) + fee.handling;
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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue ACRO n'existe pas encore : lancer `node brokers/acro/acro_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ACRO` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ACRO`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "acro",
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
  const inApp = listing.type !== "ETF";
  const fee = inApp ? APP : DESK;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    onlineBuy: inApp,
    cashCurrency: "ISK",
    basis: inApp
      ? `ordre dans l'appli ACRO, barème relu le ${READ_ON}. 0,65 % par ordre, minimum 1 750 ISK, plus 750 ISK.`
      : `ETF : l'appli ACRO ne traite que les actions, ordre au guichet, barème relu le ${READ_ON}. 1,0 % par ordre, minimum 5 000 ISK, plus 1 250 ISK.`,
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
  const each = side(notional, fee);
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
    commission: { rate: fee.rate, minimum: fee.minimum, handling: fee.handling, each, eachWay: true, currency: listing.currency },
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
