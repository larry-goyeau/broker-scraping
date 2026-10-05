// What one round trip costs at Union Bank of Taiwan: buy n shares,
// sell them back, in dollars. Online order.
//
// https://www.ubot.com.tw/stocks_ETF
// read on 2026-10-05. The same card covers a foreign share and a
// foreign ETF.
//   Buy and sell, each side   the posted 1.5% of the fill. A promotion
//                             is not a printed rate, so the number uses
//                             the posted one.
//   Market charges            the broker's dealing charge, and on a
//                             sale the levies and the transaction tax,
//                             are included in that 1.5%. The part above
//                             it is taken extra and is not priced, so
//                             it stays in the remark.
//   Trust management          free the first year. From the second year,
//                             0.2% a year by the day, taken from the
//                             sale, at least the equivalent of NT$200
//                             (DBU) or USD 10 (OBU). The days are not an
//                             input, so it stays out of the number.
//   United States             the quoted NBBO of the ticker. The bank
//                             does not name a US broker-dealer, so no
//                             Rule 606 mix is applied.
//   Hong Kong                 no book is published here
//   A preferred cash dividend can be withheld at 30%. That is not this
//   round trip.
//   The public spot board versus the Taiwan dollar is a bank bid and a
//   bank ask. The remark is half that spread, as
//   "FX 0.283% when cash ≠ USD". Cash notes are a different line.
//   The board was read 2026-10-05 02:29 Taipei.
//   CNH is the renminbi line; the board prints it as CNY.
//   https://www.ubot.com.tw/rates/exchangeRate
//   A row the shelf marks 限專投 adds "For professional investors only."
//
//   node brokers/unionbank/unionbank_cost.mjs AAPL US USD --shares=10 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("unionbank-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);
const PAGE = "https://www.ubot.com.tw/stocks_ETF";
const READ_ON = "2026-10-05";
const BUY = 0.015;
const SELL = 0.015;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const CUSTODY = "Custody is free the first year, then 0.2% a year, min NT$200 (DBU) or USD 10 (OBU).";
const EXTRA = "A market may charge extra fees.";
// Spot bid and ask versus the Taiwan dollar, bank buy then bank sell.
// Half the pair's spread, over the mid, is how far the ask sits above
// the middle. CNH is the renminbi line; the board prints it as CNY.
const BOARD = {
  USD: [31.765, 31.945],
  CNY: [4.72, 4.78],
  CNH: [4.72, 4.78],
};

function remarkOf(currency, row) {
  const lines = [CUSTODY];
  const pair = BOARD[code(currency)];
  if (pair) {
    const [bid, ask] = pair;
    const gap = ((ask - bid) / (ask + bid)) * 100;
    lines.push(`FX ${gap.toFixed(3)}% when cash ≠ ${code(currency)}.`);
  }
  lines.push(EXTRA);
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
    return { ...answer, why: "le catalogue Union Bank of Taiwan n'existe pas encore : lancer `node brokers/unionbank/unionbank_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Union Bank of Taiwan` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Union Bank of Taiwan`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "unionbank",
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
  const quoted = american ? usBookPerShare({ broker: "unionbank", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: remarkOf(listing.currency, m.row),
    basis: `livraison en ligne, page relue le ${READ_ON}. Achat 1,5 %. Vente 1,5 %.`,
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
