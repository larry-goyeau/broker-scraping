// What one round trip costs at DBS Bank (Taiwan): buy n shares, sell
// them back, online, in dollars.
//
// Risk disclosure, version 202511, read on 2026-10-02.
//   https://www.dbs.com.tw/iwov-resources/pdf/legal%20disclaimers%20and%20announcements/01_personal%20finance/05_investments/foreign-stocks-risk-disclosure.pdf
// The 8 November 2025 notice is what added the floors:
//   https://www.dbs.com.tw/iwov-resources/pdf/foreign-stocks/20250829_EQETF.pdf
//   Online, each side          0.55% of the fill
//   Phone                      1.2%. That is another table.
//   Floor, each side           US 20 USD
//                              Hong Kong 120 HKD, 20 USD or 120 RMB
//                              Japan 2,400 JPY
//                              Australia 24 AUD
//   A redemption whose fill is below that floor is taken entirely as
//   the fee. The client receives nothing back.
//   Trust management           0.15% a year by the day, at least NT$200,
//                              for at most three years, taken from the
//                              sale. The days are not an input, so it
//                              stays out.
//   Exchange taxes             named (a US sale, and Hong Kong stamp,
//                              transaction fee and levy) and not rated,
//                              so none is added.
//   United States              the quoted NBBO of the ticker. The bank
//                              does not name a US broker-dealer, so no
//                              Rule 606 mix is applied.
//   Tokyo                      that exchange's book, when one is stored
//   Hong Kong, Australia       no book is published here
//   The client pays in the listing currency and converts alone. The
//   order adds no exchange charge. The public board versus the Taiwan
//   dollar is a bid and an ask. The remark is how far the ask sits
//   above their middle, as "FX 0.333% when cash ≠ USD". Read 2026-10-02 17:40.
//   https://www.dbs.com.tw/personal-zh/rates/foreign-exchange-rates.page
//
//   node brokers/dbs/dbs_cost.mjs AAPL US USD --shares=10 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("dbs-parsed.json", import.meta.url);
const PAGE =
  "https://www.dbs.com.tw/iwov-resources/pdf/legal%20disclaimers%20and%20announcements/01_personal%20finance/05_investments/foreign-stocks-risk-disclosure.pdf";
const READ_ON = "2026-10-02";
const RATE = 0.0055;
const FLOOR = { USD: 20, HKD: 120, CNH: 120, JPY: 2400, AUD: 24 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const CUSTODY = "Custody is 0.15% a year, min NT$200, for at most three years.";
// ttBuy, ttSell versus one New Taiwan dollar unit of the currency.
// ttSell is the ask: what the client pays to buy that currency.
const BOARD = {
  USD: [31.748, 31.96],
  HKD: [4.022, 4.095],
  JPY: [0.1996, 0.204],
  AUD: [21.96, 22.32],
  CNH: [4.7172, 4.7813],
  CNY: [4.7172, 4.7813],
};

function remarkOf(currency) {
  const pair = BOARD[code(currency)];
  if (!pair) return CUSTODY;
  const [bid, ask] = pair;
  const mid = (bid + ask) / 2;
  const gap = ((ask - mid) / mid) * 100;
  return `${CUSTODY}\nFX ${gap.toFixed(3)}% when cash ≠ ${code(currency)}.`;
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

function sideFee(notional, floor, sell) {
  const percent = notional * RATE;
  const charged = Math.max(percent, floor);
  if (sell && notional < floor) return notional;
  return charged;
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
    remark: CUSTODY,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue DBS n'existe pas encore : lancer `node brokers/dbs/dbs_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue DBS` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez DBS`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "dbs",
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
  const floor = FLOOR[listing.currency];
  const american = loose(listing.brokerExchange) === "US" && listing.currency === "USD";
  const quoted = american ? usBookPerShare({ broker: "dbs", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: remarkOf(listing.currency),
    basis: `livraison en ligne, notice relue le ${READ_ON}. Achat et vente 0,55 %, plancher par marché. Les taxes de place sont nommées sans taux.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (floor == null) return { ...shared, why: `${listing.currency} n'a pas de plancher publié` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buy = sideFee(notional, floor, false);
  const sell = sideFee(notional, floor, true);
  const brokerFees = dollars(buy + sell, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
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
    commission: { rate: RATE, floor, buy, sell, currency: listing.currency },
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
