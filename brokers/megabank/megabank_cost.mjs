// What one round trip costs at Mega International Commercial Bank:
// buy n shares, sell them back, in dollars. Online order.
//
// https://www.megabank.com.tw/personal/wealth/product/intro/etf-and-stocks
// read on 2026-10-02.
//   Buy, online                 1% of the fill, paid at settlement
//   Sell                        at most 0.15% of the fill, taken by the
//                               upstream broker. The page prints the
//                               ceiling, so the number uses it.
//   Trust management            0.2% a year by the day, at least NT$200,
//                               taken from the sale. The days are not an
//                               input, so it stays out.
//   United States               the quoted NBBO of the ticker. The bank
//                               does not name a US broker-dealer, so no
//                               Rule 606 mix is applied.
//   Tokyo                       that exchange's book, when one is stored
//   Hong Kong                   no book is published here
//   Dividend tax, the ADR fee and the lot size stay out of the number.
//   The order adds no exchange charge. The public board versus the
//   Taiwan dollar is a bid and an ask. The remark is half that spread,
//   as "FX 0.157% when cash ≠ USD". Read 2026-10-03 01:58.
//   https://www.megabank.com.tw/personal/savings/foreign-service/forex
//
//   node brokers/megabank/megabank_cost.mjs AA US USD --shares=10 --price=42
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

const CATALOGUE = new URL("megabank-parsed.json", import.meta.url);
const PAGE = "https://www.megabank.com.tw/personal/wealth/product/intro/etf-and-stocks";
const READ_ON = "2026-10-02";
const BUY = 0.01;
const SELL = 0.0015;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const CUSTODY = "Custody is 0.2% a year, min NT$200.";
// Spot bid and ask versus the Taiwan dollar. Half the pair's spread,
// over the mid, is how far the ask sits above the middle. CNH is the
// renminbi line; the board prints it as CNY.
const BOARD = {
  USD: [31.78, 31.88],
  HKD: [4.03, 4.09],
  JPY: [0.1998, 0.2039],
  CNY: [4.723, 4.773],
  CNH: [4.723, 4.773],
  EUR: [35.65, 36.05],
  GBP: [41.96, 42.36],
  AUD: [22.01, 22.25],
  CAD: [22.25, 22.45],
  SGD: [24.81, 24.99],
  ZAR: [1.86, 1.96],
  SEK: [3.12, 3.22],
  CHF: [38.32, 38.52],
  THB: [0.929, 0.971],
  NZD: [17.77, 17.97],
};

function remarkOf(currency) {
  const pair = BOARD[code(currency)];
  if (!pair) return CUSTODY;
  const [bid, ask] = pair;
  const gap = ((ask - bid) / (ask + bid)) * 100;
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
    return { ...answer, why: "le catalogue Mega Bank n'existe pas encore : lancer `node brokers/megabank/megabank_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Mega Bank` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Mega Bank`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "megabank",
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
  const american = loose(listing.brokerExchange) === "US" && listing.currency === "USD";
  const quoted = american ? usBookPerShare({ broker: "megabank", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: remarkOf(listing.currency),
    basis: `livraison en ligne, page relue le ${READ_ON}. Achat 1 %. Vente : plafond 0,15 %.`,
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
  const ticket = notional * (BUY + SELL);
  const brokerFees = dollars(ticket, listing.currency);
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
    commission: { buy: BUY, sell: SELL, currency: listing.currency },
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
