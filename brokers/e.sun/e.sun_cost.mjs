// What one round trip costs at E.SUN: buy n shares, sell them
// back, in dollars. Online order.
//
// https://wealth.esunbank.com/zh-tw/etf/intro
// read on 2026-10-03. The only schedule the bank prints sits under
// ETF相關費用. The share pages print no rate of their own, so the
// same band is used for a share.
//   Buy                         1.0–2.0% of the fill, per product.
//                               The page prints the band, so the
//                               number uses the top, 2%.
//   Sell                        0.5–1.0% of the fill, per product.
//                               The number uses the top, 1%.
//   Trust management            0.2% of the principal. The page prints
//                               no minimum and no day count, so it
//                               stays out of the number.
//   Market taxes                named (transaction levy, stamp duty,
//                               clearing, handling, supervision,
//                               dividend tax) and not rated. The page
//                               says they are not an extra bank charge,
//                               so none is added.
//   United States               the quoted NBBO of the ticker. The bank
//                               does not name a US broker-dealer, so no
//                               Rule 606 mix is applied.
//   Tokyo                       that exchange's book, when one is stored
//   Hong Kong, Shanghai,
//   Shenzhen                    a stored book, when one is stored
//   The public spot board versus the Taiwan dollar is a bank bid and
//   a bank ask. The remark is half that spread, as
//   "FX 0.157% when cash ≠ USD". Read 2026-10-03 06:30 Taipei.
//   A Shanghai or Shenzhen row is marked professional on the shelf.
//   The remark then adds "For professional investors only."
//   https://www.esunbank.com/zh-tw/personal/deposit/rate/forex/foreign-exchange-rates
//
//   node brokers/e.sun/e.sun_cost.mjs AAPL US USD --shares=10 --price=200
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

const CATALOGUE = new URL("e.sun-parsed.json", import.meta.url);
const PAGE = "https://wealth.esunbank.com/zh-tw/etf/intro";
const READ_ON = "2026-10-03";
const BUY = 0.02;
const SELL = 0.01;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const CUSTODY = "Custody is 0.2% a year.";
// Spot bid and ask versus the Taiwan dollar, bank buy then bank sell.
// Half the pair's spread, over the mid, is how far the ask sits above
// the middle. CNH is the renminbi line; the board prints it as CNY.
const BOARD = {
  USD: [31.81, 31.91],
  HKD: [4.028, 4.088],
  JPY: [0.1999, 0.2039],
  CNY: [4.73, 4.78],
  CNH: [4.73, 4.78],
};

function remarkOf(currency, row) {
  const lines = [CUSTODY];
  const pair = BOARD[code(currency)];
  if (pair) {
    const [bid, ask] = pair;
    const gap = ((ask - bid) / (ask + bid)) * 100;
    lines.push(`FX ${gap.toFixed(3)}% when cash ≠ ${code(currency)}.`);
  }
  if (String(row?.raw || "").trim().endsWith("professional")) lines.push("For professional investors only.");
  return lines.join("\n");
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
    return { ...answer, why: "le catalogue E.SUN n'existe pas encore : lancer `node brokers/e.sun/e.sun_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue E.SUN` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez E.SUN`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "e.sun",
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
  const quoted = american ? usBookPerShare({ broker: "e.sun", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: remarkOf(listing.currency, m.row),
    basis: `livraison en ligne, page relue le ${READ_ON}. Achat : plafond 2 %. Vente : plafond 1 %.`,
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
