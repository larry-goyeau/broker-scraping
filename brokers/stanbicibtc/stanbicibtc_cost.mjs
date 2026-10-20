// What one round trip costs at Stanbic IBTC Stockbrokers: buy n shares (or
// ETF units) on the Nigerian Exchange and sell them straight back, in
// dollars. Every catalogue line is a naira line and the account is held in
// naira, so nothing is converted.
//
// https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking/products-and-services/products/equities
// https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking/products-and-services/products/etf
// read on 2026-10-18. Both pages print the same "Trading costs":
//   Buying     1.1325 % of the consideration amount
//   Selling    1.4775 % of the consideration amount
//   CSCS alert fee + VAT of ₦4.30 per trade clip, each side
//   No set-up costs.
// The two rates are all-in figures: the page does not split them into
// Stanbic's brokerage, VAT and the NGX card (SEC, NGX, CSCS, stamp duty),
// so they are counted whole in brokerFees and nothing from the NGX card is
// added on top, which would count it twice. The pages carry no date (the
// market share they quote is from 2021). One clip a side is assumed. The
// channel is the same for the trading portal and the desk; the page names
// no online discount.
// The Nigerian book is read from spreads/ as in brokers/sharessaver; a
// missing book stays missing.
//
//   node brokers/stanbicibtc/stanbicibtc_cost.mjs DANGCEM NGX NGN --shares=10 --price=1066.7
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("stanbicibtc-parsed.json", import.meta.url);
const PAGE =
  "https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking/products-and-services/products/equities";
const ETF_PAGE =
  "https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking/products-and-services/products/etf";
const READ_ON = "2026-10-18";
const BUY = 0.011325;
const SELL = 0.014775;
const ALERT = 4.3;
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
    return { ...answer, why: "le catalogue Stanbic IBTC n'existe pas encore : lancer `node brokers/stanbicibtc/stanbicibtc_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Stanbic IBTC` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Stanbic IBTC`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "stanbicibtc",
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
    url: listing.type === "ETF" ? ETF_PAGE : PAGE,
    basis:
      `coûts de transaction Stanbic IBTC relus le ${READ_ON} : achat 1,1325 %, vente 1,4775 % du montant, ` +
      `tout compris, plus l'alerte CSCS 4,30 ₦ TVA comprise par exécution, chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `Stanbic IBTC ne publie un barème que pour le naira ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buy = notional * BUY + ALERT;
  const sell = notional * SELL + ALERT;
  const brokerFees = dollars(buy + sell, listing.currency);
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
    commission: { buy: BUY, sell: SELL, alert: ALERT, currency: listing.currency, buyNgn: buy, sellNgn: sell },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      courtageNgn: finite(buy + sell, 6),
    },
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
