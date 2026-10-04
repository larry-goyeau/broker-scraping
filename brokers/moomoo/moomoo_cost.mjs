// What one round trip costs at moomoo証券: buy n shares, sell them back,
// in dollars. Online cash order. The account's own setting starts on the
// basic course, so that is the line priced here. The advance course, margin,
// options, NISA and odd lots stay out.
//
// https://www.moomoo.com/jp/pricing
// https://www.moomoo.com/jp/support/topic7_229
// Read on 2026-10-03.
//   Japan stocks and ETFs, each side     commission 0 yen, system fee 0 yen
//                                        https://www.moomoo.com/jp/support/topic7_189
//   The Japan page does not print a REIT or ETN line, so those stay out
//   of the number.
//   United States stocks and ETFs, basic course, each side, tax included
//                                        0.132 % of the fill
//                                        under 0.01 USD is charged as 0.01 USD
//                                        rounded up to the cent
//                                        capped at 22 USD
//                                        local clearing is borne by moomoo
//                                        https://www.moomoo.com/jp/support/topic7_183
//   Yen-dollar conversion is not part of this ticket. A manual conversion
//   has no fee and a spread of about 0.03 yen per dollar, which can change
//   with the hour. The remark is half that spread over the dollar mid,
//   as "FX 0.010% when cash ≠ USD". Buying from yen, or an automatic
//   conversion back to yen, is 0.25 yen per dollar and is not this line.
//                                        https://www.moomoo.com/jp/support/topic7_176
//   The December 2025 trading booklet sends a US stock order to Futu
//   Clearing Inc. The book is that firm's Rule 606.
//   https://risk-disclosure.jp.moomoo.com/j/JPINTR210?l=ja
//
//   node brokers/moomoo/moomoo_cost.mjs 1305 Tokyo JPY --shares=10 --price=400
//   node brokers/moomoo/moomoo_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("moomoo-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);
const PAGE = "https://www.moomoo.com/jp/pricing";
const JAPAN_PAGE = "https://www.moomoo.com/jp/support/topic7_189";
const US_PAGE = "https://www.moomoo.com/jp/support/topic7_183";
const READ_ON = "2026-10-03";
const US_RATE = 0.00132;
const US_FLOOR = 0.01;
const US_CAP = 22;
// Full spread, yen per dollar. Half of it, over the dollar mid, is one way.
const FX_SPREAD_JPY = 0.03;
const yenPerDollar = usdPer("JPY") ? 1 / usdPer("JPY") : null;
const FX_REMARK =
  yenPerDollar == null
    ? fxRemark("", "USD")
    : fxRemark((((FX_SPREAD_JPY / 2) / yenPerDollar) * 100).toFixed(3), "USD");

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

function usSide(notional) {
  const raw = notional * US_RATE;
  if (!(raw > 0)) return null;
  const floored = raw < US_FLOOR ? US_FLOOR : raw;
  const cents = Math.ceil(floored * 100 - 1e-8);
  return Math.min(US_CAP, cents / 100);
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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue moomoo n'existe pas encore : lancer `node brokers/moomoo/moomoo_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue moomoo` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez moomoo`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "moomoo",
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
  const japan = listing.mic === "XTKS" || loose(listing.brokerExchange) === "TOKYO";
  const american = ["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(listing.mic) && listing.currency === "USD";
  if (japan && listing.type !== "STOCK" && listing.type !== "ETF") {
    return {
      ...answer,
      listing,
      cashCurrency: listing.currency,
      url: JAPAN_PAGE,
      why: "le barème Japon imprime la commission des actions et des ETF, pas celle des REIT ni des ETN",
    };
  }
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }

  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    url: japan ? JAPAN_PAGE : US_PAGE,
    remark: american ? FX_REMARK : "",
    basis: japan
      ? `livraison en ligne, barème relu le ${READ_ON}. Achat 0 ¥. Vente identique.`
      : `livraison en ligne, cours de base, barème relu le ${READ_ON}. Achat 0,132 % TTC, plancher 0,01 USD, plafond 22 USD, arrondi au centime supérieur. Vente identique. La liquidation locale est à la charge de moomoo.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buy = japan ? 0 : usSide(notional);
  const sell = japan ? 0 : usSide(notional);
  const brokerFees = japan ? 0 : dollars(buy + sell, "USD");
  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (american) {
    const quoted = usBookPerShare({ broker: "moomoo", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
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
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: japan
      ? { buy: 0, sell: 0, currency: "JPY" }
      : { buy, sell, currency: "USD", rate: US_RATE, min: US_FLOOR, max: US_CAP },
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
