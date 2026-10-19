// What one round trip costs at Mirae Asset Securities Vietnam: buy n
// shares, sell them back, in dollars. Online order on the self-directed
// channel, with no broker.
//
// https://masvn.com/cate/bieu-phi-53
// read on 2026-10-06. The sheet applies from 1 December 2025. One line
// covers a share, a fund certificate and a covered warrant listed on
// HOSE, HNX and UPCOM, matched or negotiated. The catalogue's ETFs are
// those certificates.
//   Online, no broker, each side   0.10% of the fill, for a domestic
//                                  client at every size and for a
//                                  foreign client. The same table prices
//                                  the online channel with a broker at
//                                  0.15%, and the floor or the phone at
//                                  0.25% under 100 million dong and
//                                  0.20% from there for a domestic
//                                  client, 0.40% for a foreign client.
//                                  This file prices the channel with no
//                                  broker.
//   The printed rate already includes the fee paid to the exchange.
//                                  Section VIII prints that fee apart
//                                  (0.027% for a listed share, 0.018%
//                                  for an UPCOM share or an ETF) and it
//                                  is not added again.
//   Sale tax                       not in the rate. The sheet says the
//                                  personal income tax due by law is
//                                  extra. That tax is 0.1% of the sale.
//   Sale transfer                  0.3 dong a share, capped at 300,000
//                                  dong a symbol, to settle the sale.
//   Custody                        0.27 dong a share or a fund
//                                  certificate a month. The months are
//                                  not an input, so it stays in the
//                                  remark.
//   HOSE, UPCOM                    the BSC board, read by spreads/vn-touch.mjs
//   HNX                            no book is published here
//
//   node brokers/mirae/mirae_cost.mjs VNM HOSE VND --shares=10 --price=57300
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("mirae-parsed.json", import.meta.url);
const PAGE = "https://masvn.com/cate/bieu-phi-53";
const READ_ON = "2026-10-06";
const RATE = 0.001;
const SALE_TAX = 0.001;
const TRANSFER = 0.3;
const TRANSFER_CAP = 300_000;
const CUSTODY = "Custody is 0.27 VND a share a month.";

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
    return { ...answer, why: "le catalogue Mirae n'existe pas encore : lancer `node brokers/mirae/mirae_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Mirae` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Mirae`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "mirae",
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
      `livraison en ligne, canal sans courtier, barème du 1er décembre 2025 relu le ${READ_ON}. ` +
      `Achat 0,1 %, frais de place inclus. Vente 0,1 %, plus 0,1 % d'impôt sur la cession, ` +
      `plus 0,3 VND par titre (plafond 300 000).`,
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
  const transfer = Math.min(n * TRANSFER, TRANSFER_CAP);
  const ticket = notional * (RATE + RATE + SALE_TAX) + transfer;
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
    commission: { buy: RATE, sell: RATE + SALE_TAX, currency: listing.currency },
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
