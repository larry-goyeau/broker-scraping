// What one round trip costs at Meristem Securities through MeriTrade: buy n
// shares (or ETF units) on the Nigerian Exchange and sell them straight
// back, in dollars. The account is in naira and every listing is a naira
// line, so nothing is converted.
//
// https://meritrade.com/faq (the FAQ sits in the page's JavaScript)
// read on 2026-10-24, "What is your commission rate?":
//   "Brokerage commission is 1.35% respectively for buy and sell orders.
//    This excludes other regulatory fees."
// So 1.35% of the consideration on the buy and on the sell. No floor and no
// ticket are printed, and opening the account is free. The FAQ prints no
// figure for the regulatory fees it excludes, so they are the NGX equities
// card, as in ../sharessaver and ../bamboo,
// https://ngxgroup.com/exchange/trade/equities/trading-market-structure/
// read on 2026-10-18:
//   Buy     SEC 0.3%, stamp duty 0.08%, trade alert ₦4,
//           VAT 7.5% of brokerage and the SEC fee
//   Sell    NGX 0.3%, CSCS 0.3%, stamp duty 0.08%, trade alert ₦4,
//           VAT 7.5% of the NGX fee, the CSCS fee and brokerage
// The card's brokerage range is 0.75–1.35%; MeriTrade charges the top of
// it, and the VAT on brokerage is 7.5% of that 1.35%. Brokerage and its
// VAT are `brokerFees`; the rest of the card sits in `parts.taxes`.
//
// Left out: margin lending (21% a year plus a 2% management fee) is a loan,
// not this trip. Resident-house fees on a share transfer are not a trade.
// The Nigerian book is read from spreads/ as in the siblings; a missing
// book stays missing.
//
//   node brokers/meristem/meristem_cost.mjs DANGCEM NGX NGN --shares=10 --price=1066.7
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("meristem-parsed.json", import.meta.url);
const PAGE = "https://meritrade.com/faq";
const NGX_CARD = "https://ngxgroup.com/exchange/trade/equities/trading-market-structure/";
const READ_ON = "2026-10-24";
const CARD_READ_ON = "2026-10-18";
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
    return { ...answer, why: "le catalogue MeriTrade n'existe pas encore : lancer `node brokers/meristem/meristem_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue MeriTrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez MeriTrade`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "meristem",
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
      `FAQ MeriTrade relue le ${READ_ON} : courtage 1,35 % à l'achat et à la vente, hors frais réglementaires ; TVA 7,5 % sur le courtage. ` +
      `Frais de place NGX (barème relu le ${CARD_READ_ON}) : achat SEC 0,3 %, vente NGX 0,3 % et CSCS 0,3 %, droit de timbre 0,08 % et alerte 4 ₦ chaque sens, TVA 7,5 % sur ces frais.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `MeriTrade ne publie un barème que pour le naira ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  // What Meristem bills, one side, in naira: brokerage and its VAT.
  const brokerage = notional * BROKERAGE;
  const side = brokerage + VAT * brokerage;
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
