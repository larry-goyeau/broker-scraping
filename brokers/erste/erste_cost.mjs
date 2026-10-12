// What one round trip costs at Erste Biuro Maklerskie: buy n shares at
// price p, sell them back at once, in dollars. The standard account,
// internet column. The phone column, and the VIP, Trader and TopTrader
// accounts, stay out.
//
// Tariff in force from 25 April 2026, read 2026-10-12. Table 3.
//
//   Poland, internet, securities and warrants, bonds excluded
//     GPW, NewConnect and GlobalConnect
//       0.39 % min 5 zł per order
//     same-day reverse trade, part 2 point 3
//       0.25 %, and that column has no minimum. The figure stays at
//       0.39 % min 5 zł. The remark is the gap.
//   Abroad, internet, excluding foreign bonds and structured notes
//     USA, Germany, France, Italy, the United Kingdom, Switzerland,
//     Belgium and the Netherlands
//       0.29 % min 5 USD, EUR, GBP or CHF
//     the other markets
//       0.29 % min 20 USD, EUR, GBP or CHF, or 250 SEK
//     same-day reverse trade
//       0.25 %, no minimum. The figure stays at 0.29 % and its minimum.
//
// The commission is taken in the currency of the order. A foreign-currency
// account in EUR, USD, CHF, GBP or SEK is free, so the conversion stays
// out of the ticket: the tariff prints no spread. Custody and the account
// fee are not this order. Stamp and transaction tax come from the tax map.
// Erste names no US broker-dealer, so no Rule 606 mix is applied. A US
// line with no leaf uses the quoted NBBO.
//
//   https://www.erste.pl/regulation_file_server/time20260417083103/download?id=169231&lang=pl_PL
//
//   node brokers/erste/erste_cost.mjs PLPKN0000018 GPW PLN --shares=10 --price=100
//   node brokers/erste/erste_cost.mjs US0378331005 NASDAQ USD --shares=10 --price=200
//   node brokers/erste/erste_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("erste-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.erste.pl/regulation_file_server/time20260417083103/download?id=169231&lang=pl_PL",
  readOn: "2026-10-12",
  tariffOn: "2026-04-25",
  entity: "Erste Biuro Maklerskie",
};

const POLISH_RATE = 0.0039;
const POLISH_MIN = 5;
const FOREIGN_RATE = 0.0029;
const DAY_RATE = 0.0025;

// Table 3 point 10. Settlement currency of the order.
const MAJOR_MIN = { USD: 5, EUR: 5, GBP: 5, CHF: 5 };
// Table 3 point 11.
const OTHER_MIN = { USD: 20, EUR: 20, GBP: 20, CHF: 20, SEK: 250 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function marketOf(exchange) {
  const ex = loose(exchange);
  if (ex === "GPW" || ex === "XWAR" || ex === "NEWCONNECT" || ex === "GLOBALCONNECT") return "pl";
  if (
    [
      "NYSE",
      "NASDAQ",
      "AMEX",
      "CBOE",
      "OTC",
      "XETRA",
      "LSE",
      "SIX",
      "EURONEXTPARIS",
      "EURONEXTAMSTERDAM",
      "EURONEXTBRUSSELS",
      "BORSAITALIANA",
    ].includes(ex)
  ) {
    return "major";
  }
  if (["BME", "NASDAQSTOCKHOLM", "HEX", "VSE", "EURONEXTLISBON"].includes(ex)) return "other";
  return "";
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

function legOf(market, currency) {
  const cash = listingCash(currency);
  if (market === "pl") {
    return { rate: POLISH_RATE, min: POLISH_MIN, currency: "PLN", label: "0.39 % min 5 zł" };
  }
  const min = (market === "major" ? MAJOR_MIN : OTHER_MIN)[cash];
  if (min == null) return null;
  return { rate: FOREIGN_RATE, min, currency: cash, label: `0.29 % min ${min} ${cash}` };
}

function orderAmount(notional, spec) {
  return Math.max(notional * spec.rate, spec.min);
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
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
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Erste n'existe pas encore : lancer `node brokers/erste/erste_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Erste` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Erste`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "erste",
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
  const market = marketOf(listing.brokerExchange);
  const rule = legOf(market, listing.currency);
  if (!rule) {
    return {
      ...answer,
      listing,
      why: market
        ? `${listing.currency} n'a pas de minimum dans la taryfa`
        : `${listing.brokerExchange || "cette place"} n'a pas de ligne dans la taryfa`,
    };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const american = (loose(listing.brokerExchange) === "NYSE" || loose(listing.brokerExchange) === "NASDAQ") && listing.currency === "USD";
  const shared = {
    ...answer,
    listing,
    cashCurrency: rule.currency,
    remark: `If the sale is the same day, the commission is -${((rule.rate - DAY_RATE) * 100).toFixed(2)}%.`,
    url: SCHEDULE.url,
    basis: `taryfa Erste du ${SCHEDULE.tariffOn}, relue le ${SCHEDULE.readOn} : ${rule.label} par ordre`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "erste", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const local = orderAmount(notional, rule);
  const sideUsd = dollars(local, rule.currency);
  const brokerFees = plus(sideUsd, sideUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    market === "pl" ? "marché polonais, ordre internet, position gardée plus d'un jour" : `ordre internet, commission en ${rule.currency}`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? american
          ? `carnet NBBO coté ${marketPerShare} $ la part : Erste n'a pas de 606`
          : `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      rate: rule.rate,
      min: rule.min,
      currency: rule.currency,
      eachWay: true,
      sellRate: rule.rate,
    },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          poland: "0.39 % min 5 PLN, internet",
          dayTrade: "0.25 %, no minimum",
          major: "0.29 % min 5 USD, EUR, GBP or CHF",
          other: "0.29 % min 20 USD, EUR, GBP or CHF, or 250 SEK",
          rule606: null,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/erste/erste_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
