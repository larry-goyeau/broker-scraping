// What one round trip costs at Avanza: buy n shares at price p, sell
// them back at once, in dollars. The online ticket, on the site or in
// the app. Phone orders are a different ticket and are not this one.
// Private Banking and Pro stay out.
//
// Price list read on 2026-10-08. The account picks Start, Mini, Small,
// Medium or Fast pris and can change it, so the bill is the cheapest
// of the five for this order.
//
//   Stockholm shares
//     Start 0, Mini 0.25 % floor 1, Small 0.15 % floor 39,
//     Medium 0.069 % floor 69, Fast pris flat 99. SEK.
//   First North Sweden
//     Start and Mini 0.25 % floor 1, then the Stockholm floors.
//     Fast pris is a flat 99.
//   NGM and Nordic MTF
//     0.25 % floor 19, 0.15 % floor 39, 0.069 % floor 69,
//     Fast pris 0.045 % floor 99.
//   Spotlight
//     same, except Small floors at 59.
//   beQuoted
//     0.25 % / 0.15 % / 0.069 % / 0.045 %, every floor 119.
//   Swedish listed ETFs
//     0.25 % floor 1, 0.15 % floor 39, 0.069 % floor 69,
//     Fast pris 0.045 % floor 99.
//   Copenhagen and Oslo shares, and their First North, Expand and Growth
//     0.25 % floor 1, 0.15 % floor 39, 0.069 % floor 69, Fast pris flat 99.
//     DKK or NOK.
//   Helsinki shares and First North Finland
//     0.25 % floor 0.95, 0.15 % floor 4.95, 0.069 % floor 7.95,
//     Fast pris flat 10.95. EUR.
//   Other Danish, Finnish and Norwegian lines
//     the "övriga värdepapper" row of that country.
//   USA, Canada, Germany, Britain, Switzerland, and France, Italy,
//     Belgium, Portugal, Spain and the Netherlands (Equiduct here)
//     0.25 % floor 1, 0.15 % floor 6, 0.089 % floor 8, 0.079 % floor 12
//     in that market's currency. Canada floors at 1, 7, 10 and 15 CAD.
//     A European line priced in dollars is charged in dollars, same floors.
//     A US line takes Virtu Americas' Q on the blended 605.
//
// A SEK line does not convert. CAD, CHF, DKK, EUR, GBP, NOK and USD can
// sit on a currency account, so the automatic exchange is not in the
// total. The remark is `FX 0.25% when cash ≠ CCY`. Exchanging yourself
// then costs about 0.125 %, which is not this trip. Any other currency
// converts automatically at 0.25 % each way, and that is in the total.
//
//   https://www.avanza.se/konton-lan-prislista/prislista/handel-sverige.html
//   https://www.avanza.se/konton-lan-prislista/prislista/handel-utland.html
//   https://www.avanza.se/kundservice.html/3747/hur-fungerar-manuell-valutavaxling/
//
//   node brokers/avanza/avanza_cost.mjs INVEB XSTO SEK --shares=10 --price=400
//   node brokers/avanza/avanza_cost.mjs AAPL XNAS USD --shares=1 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("avanza-parsed.json", import.meta.url);
const PAGE = "https://www.avanza.se/konton-lan-prislista/prislista/handel-utland.html";
const READ_ON = "2026-10-08";
const CASH = "SEK";
const FX_AUTO = 0.0025;
const FX_ACCOUNT = new Set(["CAD", "CHF", "DKK", "EUR", "GBP", "NOK", "USD"]);

const pct = (rate, min) => ({ rate, min });
const flat = (min) => ({ flat: min });
const FREE = { rate: 0, min: 0 };

const SE_STOCK = [FREE, pct(0.0025, 1), pct(0.0015, 39), pct(0.00069, 69), flat(99)];
const FN_STOCK = [pct(0.0025, 1), pct(0.0025, 1), pct(0.0015, 39), pct(0.00069, 69), flat(99)];
const NGM = [pct(0.0025, 19), pct(0.0025, 19), pct(0.0015, 39), pct(0.00069, 69), pct(0.00045, 99)];
const SPOT = [pct(0.0025, 19), pct(0.0025, 19), pct(0.0015, 59), pct(0.00069, 69), pct(0.00045, 99)];
const QUOTED = [pct(0.0025, 119), pct(0.0025, 119), pct(0.0015, 119), pct(0.00069, 119), pct(0.00045, 119)];
const SE_ETF = [pct(0.0025, 1), pct(0.0025, 1), pct(0.0015, 39), pct(0.00069, 69), pct(0.00045, 99)];
const DK_STOCK = [pct(0.0025, 1), pct(0.0025, 1), pct(0.0015, 39), pct(0.00069, 69), flat(99)];
const DK_OTHER = [pct(0.0025, 19), pct(0.0025, 19), pct(0.0015, 39), pct(0.00069, 69), pct(0.00045, 99)];
const FI_STOCK = [pct(0.0025, 0.95), pct(0.0025, 0.95), pct(0.0015, 4.95), pct(0.00069, 7.95), flat(10.95)];
const FI_OTHER = [pct(0.0025, 1.95), pct(0.0025, 1.95), pct(0.0025, 4.95), pct(0.00069, 7.95), pct(0.00045, 10.95)];
const NO_STOCK = [pct(0.0025, 1), pct(0.0025, 1), pct(0.0015, 39), pct(0.00069, 69), flat(99)];
const NO_OTHER = [pct(0.0025, 19), pct(0.0025, 19), pct(0.0025, 39), pct(0.00069, 69), pct(0.0003, 99)];
const EUROPE = [pct(0.0025, 1), pct(0.0025, 1), pct(0.0015, 6), pct(0.00089, 8), pct(0.00079, 12)];
const CANADA = [pct(0.0025, 1), pct(0.0025, 1), pct(0.0015, 7), pct(0.00089, 10), pct(0.00079, 15)];

const SWEDISH = new Set(["XSTO", "FNSE", "XNGM", "NSME", "XSAT", "XXXX"]);

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

// The cheapest of the five classes, in the currency the floor is printed in.
export function cheapestClass(rules, notional) {
  if (!rules || notional == null) return null;
  let best = null;
  for (const rule of rules) {
    const fee = rule.flat != null ? rule.flat : !(rule.rate > 0) ? rule.min || 0 : Math.max(rule.min || 0, notional * rule.rate);
    if (!best || fee < best.fee) best = { ...rule, fee };
  }
  return best;
}

function scheduleOf(row) {
  const ex = code(row.exchange);
  const ccy = code(row.currency);
  const stock = code(row.type) === "STOCK";
  if (SWEDISH.has(ex) && ccy === "SEK") {
    if (!stock) return { currency: "SEK", rules: SE_ETF };
    if (ex === "XSTO") return { currency: "SEK", rules: SE_STOCK };
    if (ex === "FNSE") return { currency: "SEK", rules: FN_STOCK };
    if (ex === "XNGM" || ex === "NSME") return { currency: "SEK", rules: NGM };
    if (ex === "XSAT") return { currency: "SEK", rules: SPOT };
    return { currency: "SEK", rules: QUOTED };
  }
  if (ex === "XSAT" && ccy === "DKK") return { currency: "DKK", rules: stock ? DK_STOCK : DK_OTHER };
  if (ex === "XSAT" && ccy === "NOK") return { currency: "NOK", rules: stock ? NO_STOCK : NO_OTHER };
  if (ex === "XCSE" || ex === "FNDK") return { currency: "DKK", rules: stock ? DK_STOCK : DK_OTHER };
  if (ex === "XHEL" || ex === "FNFI") return { currency: "EUR", rules: stock ? FI_STOCK : FI_OTHER };
  if (ex === "XOSL" || ex === "XOAS" || ex === "MERK") return { currency: "NOK", rules: stock ? NO_STOCK : NO_OTHER };
  if (ex === "XTSE" || ex === "XTSX" || ex === "XCNQ") return { currency: "CAD", rules: CANADA };
  if (ex === "XNAS" || ex === "XNYS" || ex === "XASE") return { currency: "USD", rules: EUROPE };
  if (ex === "CHIX" && ccy === "GBP") return { currency: "GBP", rules: EUROPE };
  if (ex === "CHIX" && ccy === "CHF") return { currency: "CHF", rules: EUROPE };
  if (ex === "XETR" || ex === "XEQT" || ex === "CEUX") {
    if (ccy === "USD") return { currency: "USD", rules: EUROPE };
    return { currency: "EUR", rules: EUROPE };
  }
  return null;
}

function converts(currency) {
  return currency !== CASH && !FX_ACCOUNT.has(currency);
}

function remarkOf(currency) {
  if (currency === CASH || converts(currency)) return "";
  return fxRemark((100 * FX_AUTO).toFixed(2), currency);
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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Avanza n'existe pas encore : lancer `node brokers/avanza/avanza_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Avanza` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Avanza`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "avanza",
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
  const schedule = scheduleOf(m.row);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    remark: remarkOf(listing.currency),
    basis: `Avanza, barème relu le ${READ_ON}. La classe la moins chère des cinq.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!schedule || schedule.currency !== listing.currency) {
    return { ...shared, why: `pas de courtage publié pour ${listing.exchange} en ${listing.currency}` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const chosen = cheapestClass(schedule.rules, notional);
  if (!chosen || notionalUsd == null) return { ...shared, why: "pas de cours pour cette devise" };

  const ticket = chosen.fee * 2;
  const commissionUsd = dollars(ticket, schedule.currency);
  const fxUsd = converts(listing.currency) ? notionalUsd * FX_AUTO * 2 : 0;
  const brokerFees = plus(commissionUsd, fxUsd);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const taxUsd = notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      each: chosen.fee,
      eachWay: true,
      currency: schedule.currency,
      rate: chosen.flat != null ? 0 : chosen.rate,
      min: chosen.min || 0,
      flat: chosen.flat ?? null,
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
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(arg("shares", "10")),
        price: Number(arg("price", "0")),
      }),
      null,
      2
    )
  );
}

printCli();
