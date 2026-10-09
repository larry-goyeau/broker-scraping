// What one round trip costs at MyInvestor: buy n shares at price p, sell
// them back at once, in dollars. Shares, ETFs, ETCs and ETNs. Funds,
// plans and the robo-adviser stay out.
//
// Re-read 2026-10-09.
//   https://myinvestor.es/inversion/broker/
//
//   Commission     0.12% of the amount, each way.
//                  Shares: minimum 3 EUR, maximum 25 EUR.
//                  ETFs, ETCs and ETNs: minimum 1 EUR, maximum 25 EUR.
//                  The floor and the cap are in euros, so a foreign
//                  line is converted before they apply.
//   Custody        0. Account keeping, depositary, inactivity and
//                  dividend collection are 0.
//   Exchange       The Spanish canon and foreign transaction taxes are
//                  charged by the market, not by MyInvestor. A stamp or
//                  a tax the shared file has for the ISIN is added.
//                  Anything else is left out.
//   FX             0.30% when the cash is not the listing currency. The
//                  account is in euros, so a euro line pays none. The
//                  same 0.30% applies to a dividend paid in another
//                  currency. It stays in the remark.
//
// Inversis transmits the order. Of the American names in its 2024
// retransmission report, Citigroup Global Markets Inc. is the one with
// a 606, so a US line takes that firm's Q. A European book is left as is.
//
//   node brokers/myinvestor/myinvestor_cost.mjs US0378331005 XETR EUR --shares=10 --price=200
//   node brokers/myinvestor/myinvestor_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("myinvestor-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://myinvestor.es/inversion/broker/",
  readOn: "2026-10-09",
  entity: "MyInvestor Banco, S.A.",
};

const RATE = 0.0012;
const STOCK_MIN = 3;
const FUND_MIN = 1;
const CAP = 25;
const CASH = "EUR";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function cents(amount) {
  return Math.round(amount * 100) / 100;
}

function toEur(amount, currency) {
  if (code(currency) === CASH) return amount;
  const usd = dollars(amount, currency);
  const per = usdPer(CASH);
  if (usd == null || !per) return null;
  return usd / per;
}

// One side, in euros. The percentage is taken on the euro value, then
// the floor and the cap, which the page prints in euros.
export function commissionEur(notionalEur, type) {
  const floor = type === "STOCK" ? STOCK_MIN : FUND_MIN;
  return cents(Math.min(CAP, Math.max(floor, notionalEur * RATE)));
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || loose(m.venue?.mic) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
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
    cashCurrency: CASH,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue MyInvestor n'existe pas encore : lancer `node brokers/myinvestor/myinvestor_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue MyInvestor` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez MyInvestor`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "myinvestor",
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
  const remark = listing.currency === CASH ? "" : fxRemark("0.3", listing.currency);
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    remark,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème MyInvestor, relu le ${SCHEDULE.readOn} : 0,12 % min ${listing.type === "STOCK" ? "3" : "1"} € max 25 €`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalEur = toEur(notional, listing.currency);
  const one = notionalEur == null ? null : commissionEur(notionalEur, listing.type);
  const ticketUsd = one == null ? null : dollars(one * 2, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, ticketUsd, taxUsd);
  const confidence = [
    shared.basis,
    listing.type === "STOCK" ? "barème action" : "barème ETF",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(ticketUsd, 6),
    commission: {
      each: RATE,
      minimum: listing.type === "STOCK" ? STOCK_MIN : FUND_MIN,
      maximum: CAP,
      currency: CASH,
      eachWay: true,
    },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de carnet pour ce ticker"}` }
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
      courtage: finite(ticketUsd, 6),
      bourse: finite(0, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({
      ...SCHEDULE,
      rate: "0.12% each way",
      stock: "min 3 EUR, max 25 EUR",
      etf: "min 1 EUR, max 25 EUR",
      fx: "0.30% when cash is not the listing currency",
    }, null, 2));
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/myinvestor/myinvestor_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
