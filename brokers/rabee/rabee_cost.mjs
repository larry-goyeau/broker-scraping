// What one round trip costs at Rabee Securities: buy n shares, sell
// them back, in dollars. The app trades listed ISX shares. There is no
// ETF on that exchange.
//
// https://rs.iq/faqs/
// read on 2026-10-06.
//   Brokerage, each side     0.50% of the trading value. The FAQ calls
//                            this the commission the law adds. The
//                            account contract leaves the percentage
//                            blank and says it is taken on a buy and
//                            on a sell, so the FAQ figure is this ticket.
//   ISX fee, each side       0.10% of the trading value, printed next
//                            to the commission. The beginner guide
//                            deducts 0.60% on a purchase, which is the
//                            two added, and names no other charge.
//                            https://rs.iq/how-to-buy-stocks-a-beginners-guide-to-investing-in-the-stock-market/
//   No floor is printed, and no sale tax.
//   Custody                The non-Iraqi contract charges one basis
//                          point of the portfolio at each month end,
//                          at least $10 when the portfolio is under
//                          $100,000 and at most $1,000, and says the
//                          charge stops once a third-party custodian
//                          is available. The months are not an input,
//                          so it stays in the remark. The Iraqi
//                          individual contract does not print it.
//                          https://rs.iq/wp-content/uploads/2026/03/RS-Contract-Individual-English_Non-Iraqi.pdf
//   ISX                    no book is published here
//
//   node brokers/rabee/rabee_cost.mjs TASC ISX IQD --shares=10 --price=9
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("rabee-parsed.json", import.meta.url);
const PAGE = "https://rs.iq/faqs/";
const READ_ON = "2026-10-06";
const COMMISSION = 0.005;
const EXCHANGE = 0.001;
const EACH = COMMISSION + EXCHANGE;
const REMARK = "Custody on a non-Iraqi account is 0.01% a month, minimum $10 under $100,000 and maximum $1,000, until a third-party custodian is available.";

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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Rabee n'existe pas encore : lancer `node brokers/rabee/rabee_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Rabee` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Rabee`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "rabee",
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
      `livraison, barème relu le ${READ_ON}. ` +
      `Achat 0,50 % plus frais de place 0,10 %. Vente 0,50 % plus frais de place 0,10 %.`,
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
  const ticket = notional * (EACH + EACH);
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
    commission: { buy: EACH, sell: EACH, broker: COMMISSION, exchange: EXCHANGE, currency: listing.currency },
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
