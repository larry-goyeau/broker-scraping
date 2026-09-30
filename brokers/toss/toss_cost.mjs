// What one round trip costs at Toss Securities: buy n shares at price p,
// sell them back at once, in dollars. The mobile schedule. Stock
// accumulation, the Nextrade rate and a negotiated large-account rate stay
// out.
//
// Re-read 2026-09-28.
//
//   KOSPI, KOSDAQ     0.015% each way, truncated under 1 won
//   US                0.1% each way, truncated under 0.01 USD
//   KOSPI sell tax    0.05% transaction tax + 0.15% rural special tax
//   KOSDAQ sell tax   0.20% transaction tax
//   US sell           SEC fee, the greater of 0.00206% and 0.01 USD
//   FX                not in the number. 0.05% during Korean hours,
//                     0.5% outside, on a conversion.
//
// A US line uses Apex Clearing's Rule 606 mix, the highest Q among the
// US broker-dealers Toss still uses. Korea has no free book.
//
//   https://corp.tossinvest.com/ko/business?tab=commission
//
//   node brokers/toss/toss_cost.mjs 005930 KOSPI KRW --shares=10 --price=70000
//   node brokers/toss/toss_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/toss/toss_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("toss-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);

const SCHEDULE = {
  url: "https://corp.tossinvest.com/ko/business?tab=commission",
  readOn: "2026-09-28",
  entity: "Toss Securities",
  venue: "the exchange named on the line",
  rule606: "apex",
};

const US = new Set(["NYSE", "NASDAQ", "AMEX", "US_ETC"]);
const KOREA = new Set(["KOSPI", "KOSDAQ"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const trunc = (amount, unit) => Math.floor(amount / unit + 1e-9) * unit;

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const want = place ? listingKey({ exchange: place, mic: place }) : {};
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function commissionOne(exchange, notional) {
  if (KOREA.has(exchange)) return { amount: trunc(notional * 0.00015, 1), currency: "KRW" };
  if (US.has(exchange)) return { amount: trunc(notional * 0.001, 0.01), currency: "USD" };
  return null;
}

function sellLevy(exchange, type, notional) {
  if (type === "STOCK" && exchange === "KOSPI") return { amount: notional * 0.002, currency: "KRW" };
  if (type === "STOCK" && exchange === "KOSDAQ") return { amount: notional * 0.002, currency: "KRW" };
  if (US.has(exchange)) {
    const raw = Math.max(notional * 0.0000206, 0.01);
    return { amount: Math.round(raw * 100) / 100, currency: "USD" };
  }
  return null;
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
    cashCurrency: "KRW",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Toss n'existe pas encore : lancer `node brokers/toss/toss_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Toss` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Toss`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "toss",
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
  const american = US.has(listing.brokerExchange) && listing.currency === "USD" && listing.brokerExchange !== "US_ETC";
  const leaf = book.leaf;
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && bp == null && perShare == null && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "toss", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    remark: listing.currency === "KRW" ? "" : "FX 0.05% in Korean hours, 0.5% outside, when cash ≠ USD.",
    url: SCHEDULE.url,
    basis: `barème Toss, relu le ${SCHEDULE.readOn} : 0,015 % en Corée, 0,1 % aux États-Unis`,
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
  const one = commissionOne(listing.brokerExchange, notional);
  if (!one) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème Toss` };
  const levy = sellLevy(listing.brokerExchange, listing.type, notional);
  const commissionUsd = dollars(one.amount * 2, one.currency);
  const levyUsd = levy ? dollars(levy.amount, levy.currency) : 0;
  const ticketUsd = plus(commissionUsd, levyUsd);
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, ticketUsd, taxUsd);
  const confidence = [
    shared.basis,
    "hors achat programmé",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? american
          ? `carnet ${marketPerShare} $ la part, mélange 606 d'Apex Clearing`
          : `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(ticketUsd, 6),
    commission: { rate: KOREA.has(listing.brokerExchange) ? 0.00015 : 0.001, currency: one.currency, eachWay: true },
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
      courtage: finite(commissionUsd, 6),
      taxes: finite(plus(levyUsd, taxUsd), 6),
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
          korea: "0.015% each way",
          us: "0.1% each way",
          fx: "0.05% in Korean hours, 0.5% outside, when cash ≠ USD",
          cash: "KRW",
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
    console.error("usage : node brokers/toss/toss_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
