// What one round trip costs at Shares Saver: buy n shares (or ETF units)
// on the Nigerian Exchange and sell them straight back, in dollars. The
// account is funded in naira only and every listing is a naira line, so
// nothing is converted.
//
// https://sharessaver.com/fees-and-charges
// read on 2026-10-18. Each buy and each sell:
//   Transaction fee        ₦1,500 per transaction.
//   Shares Saver fee       0.4% per transaction.
//   Brokerage              1.35% per trade, the regulated broker's
//                          execution charge, passed through at cost.
//   The page says brokerage and exchange charges are passed through at cost
//   and shown on every contract note, and prints no exchange rate itself.
//   Its worked example takes the ₦1,500 and the 0.4% off the amount paid in
//   and brokerage off what is left; here all three are taken on the value
//   of the shares, which is the same order of money.
//
// The exchange charges are the NGX equities card,
// https://ngxgroup.com/exchange/trade/equities/trading-market-structure/
// read on 2026-10-18:
//   Buy     SEC 0.3%, stamp duty 0.08%, trade alert ₦4,
//           VAT 7.5% of brokerage and the SEC fee
//   Sell    NGX 0.3%, CSCS 0.3%, stamp duty 0.08%, trade alert ₦4,
//           VAT 7.5% of the NGX fee, the CSCS fee and brokerage
// The card's brokerage range is 0.75–1.35%; Shares Saver prints 1.35%, so
// the VAT is 7.5% of that. Shares Saver does not say whether VAT is charged
// on its own ₦1,500 and 0.4%, so none is added there.
//
// Left out: Find My Shares (₦10,000 a search) is not a trade. Holding,
// pausing and closing are free. The FX spread is "included in rate" for
// money sent from abroad, before it reaches the naira account.
// The Nigerian book is not stored, so the total stays unknown until it is.
//
//   node brokers/sharessaver/sharessaver_cost.mjs DANGCEM NGX NGN --shares=10 --price=1066.7
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("sharessaver-parsed.json", import.meta.url);
const PAGE = "https://sharessaver.com/fees-and-charges";
const NGX_CARD = "https://ngxgroup.com/exchange/trade/equities/trading-market-structure/";
const READ_ON = "2026-10-18";
const TICKET = 1500;
const SAVER = 0.004;
const BROKERAGE = 0.0135;
const SEC = 0.003;
const NGX = 0.003;
const CSCS = 0.003;
const STAMP = 0.0008;
const ALERT = 4;
const VAT = 0.075;
const CASH = "NGN";
const REMARK = "";

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
    cashCurrency: CASH,
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Shares Saver n'existe pas encore : lancer `node brokers/sharessaver/sharessaver_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Shares Saver` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Shares Saver`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sharessaver",
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
    basis:
      `barème Shares Saver relu le ${READ_ON} : 1 500 ₦ plus 0,4 % par transaction, courtage 1,35 % plus 7,5 % de TVA, chaque sens. ` +
      `Frais de place NGX : achat SEC 0,3 %, vente NGX 0,3 % et CSCS 0,3 %, droit de timbre 0,08 % et alerte 4 ₦ chaque sens, TVA 7,5 % sur ces frais.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `Shares Saver ne publie un barème que pour le naira ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  // What Shares Saver and its broker bill, one side, in naira.
  const brokerage = notional * BROKERAGE;
  const side = TICKET + notional * SAVER + brokerage + VAT * brokerage;
  // The NGX card, both sides together.
  const sec = notional * SEC;
  const ngx = notional * NGX;
  const cscs = notional * CSCS;
  const buyCard = sec + notional * STAMP + ALERT + VAT * sec;
  const sellCard = ngx + cscs + notional * STAMP + ALERT + VAT * (ngx + cscs);
  const brokerNgn = side * 2;
  const cardNgn = buyCard + sellCard;
  const brokerFees = dollars(brokerNgn, listing.currency);
  const levies = dollars(cardNgn, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      ticket: TICKET,
      rate: SAVER,
      brokerage: BROKERAGE,
      vat: VAT,
      currency: listing.currency,
      buy: side,
      sell: side,
      eachWay: true,
    },
    buy: { sec, stamp: notional * STAMP, alert: ALERT, vat: VAT * sec },
    sell: { ngx, cscs, stamp: notional * STAMP, alert: ALERT, vat: VAT * (ngx + cscs) },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(levies, 6),
      courtageNgn: finite(brokerNgn, 6),
      taxesNgn: finite(cardNgn, 6),
    },
    sources: { fees: PAGE, ngx: NGX_CARD },
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
