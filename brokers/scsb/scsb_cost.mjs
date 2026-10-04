// What one round trip costs at Shanghai Commercial & Savings Bank:
// buy n shares, sell them back, in dollars. Online order.
//
// https://www.scsb.com.tw/content/link/link10_05.html
// read on 2026-10-03. The charges table prints one band for a foreign
// share and a foreign ETF, with no split by channel.
//   Buy and sell, each side   1%–1.5% of the fill. The page prints the
//                             band, so the number uses the top, 1.5%.
//   Floor, each side          19 USD, 150 HKD or 150 renminbi, by the
//                             pricing coin. Yen is on the shelf and the
//                             table names no yen floor, so a yen line
//                             is the percent alone.
//   Trust management          0.2% a year by the day, taken from the
//                             sale. At the counter the floor is NT$200
//                             (DBU) or 10 USD (OBU). An online sale has
//                             no floor. The days are not an input, so
//                             it stays out of the number.
//   Market taxes              the netbank guide names them and prints
//                             no rate, so none is added.
//   United States             the quoted NBBO of the ticker. The bank
//                             says the fill comes back from a securities
//                             firm and does not name that firm, so no
//                             Rule 606 mix is applied.
//   Tokyo                     that exchange's book, when one is stored
//   Hong Kong                 no book is published here
//   The public spot board versus the Taiwan dollar is a bank bid and a
//   bank ask. USD is the under-10,000 line, not the large-amount line
//   and not cash. The remark is half that spread, as
//   "FX 0.157% when cash ≠ USD". The board's own time is
//   2026-10-02 16:00 Taipei.
//   https://ebank.scsb.com.tw/info/info/page#/info/er/01/01
//
//   node brokers/scsb/scsb_cost.mjs AAPL US USD --shares=10 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("scsb-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);
const PAGE = "https://www.scsb.com.tw/content/link/link10_05.html";
const READ_ON = "2026-10-03";
const RATE = 0.015;
const FLOOR = { USD: 19, HKD: 150, CNH: 150 };

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

const CUSTODY = "Custody is 0.2% a year.";
// Spot bid and ask versus the Taiwan dollar, bank buy then bank sell.
// Half the pair's spread, over the mid, is how far the ask sits above
// the middle. USD is the small-amount spot line. CNH is the offshore
// renminbi line the board prints on its own.
const BOARD = {
  USD: [31.83, 31.93],
  HKD: [4.035, 4.092],
  JPY: [0.1999, 0.2039],
  CNH: [4.733, 4.783],
  CNY: [4.728, 4.788],
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

function sideFee(notional, floor) {
  const percent = notional * RATE;
  if (floor == null) return percent;
  return Math.max(percent, floor);
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
    return { ...answer, why: "le catalogue SCSB n'existe pas encore : lancer `node brokers/scsb/scsb_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue SCSB` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez SCSB`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "scsb",
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
  const floor = FLOOR[listing.currency] ?? null;
  const american = loose(listing.brokerExchange) === "US" && listing.currency === "USD";
  const quoted = american ? usBookPerShare({ broker: "scsb", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: remarkOf(listing.currency),
    basis: `livraison en ligne, page relue le ${READ_ON}. Achat et vente : plafond 1,5 %. Plancher 19 USD, 150 HKD ou 150 CNH. Le yen n'a pas de plancher publié.`,
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
  const buy = sideFee(notional, floor);
  const sell = sideFee(notional, floor);
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
