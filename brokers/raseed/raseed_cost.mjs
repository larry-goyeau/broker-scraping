// What one round trip costs at Raseed (Raseed Invest Limited, DIFC,
// DFSA; securities brokerage by Fullerverse (SC) Limited, a Raseed
// subsidiary licensed in Seychelles): buy n shares at price p, sell them
// back at once, in dollars. US-listed shares and ETFs, market orders in
// market hours.
//
// Read on 2026-10-21.
//   https://files.raseedinvest.com/disclosures/library/FeesPolicy.pdf
//     (Raseed Invest Limited, DIFC: linked from the Prime page)
//   https://files.raseedinvest.com/disclosures/library/raseed-global-fees-policy.pdf
//     (Fees Policy linked from the disclosures page: same commission)
//   https://raseedcapital.com/en/pricing
//   https://raseedcapital.com/en/support/account/key-selling-points-features/lowest-trading-fees
//   https://files.raseedinvest.com/disclosures/library/Raseed-Securities-Customer-Agreement.pdf
//     (V26.2026.07)
//
//   Commission      US stocks & ETFs: 0.5% of the trade, minimum $0.50,
//                   maximum $3.00, each trade, so on the buy and on the
//                   sale. No per-share charge. No rounding is printed.
//   Prime           $6.99 a month or $69.90 a year. The support page says
//                   the commission is the same on Basic and Prime (Prime
//                   adds extended hours, alerts and watchlists), so one row.
//   SEC / TAF / CAT not printed on any Raseed page or policy: $0, as in
//                   the other US files.
//   Custody         none printed ("no custody or account maintenance fees").
//   Card deposit 3.75%, wire withdrawal $15 (DIFC policy; $50 on the global
//   policy), card withdrawal 0.99%: funding, not this order.
//
// In the total: the book crossed and the commission twice. No remark: cash
// is dollars only (deposits.mjs) and every line is in dollars.
//
// No US dealer is named: the customer agreement's order-flow clause
// (section 40) names none, and the disclosures page links no carrying
// broker's document. So the book is the quoted NBBO of the symbol
// (usBookPerShare with no Q for "raseed").
//
//   node brokers/raseed/raseed_cost.mjs AAPL XNAS USD --shares=1 --price=230
//   node brokers/raseed/raseed_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/raseed/raseed_cost.mjs SPY ARCX USD --shares=100 --price=600
//   node brokers/raseed/raseed_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("raseed-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://files.raseedinvest.com/disclosures/library/FeesPolicy.pdf",
  global: "https://files.raseedinvest.com/disclosures/library/raseed-global-fees-policy.pdf",
  pricing: "https://raseedcapital.com/en/pricing",
  support: "https://raseedcapital.com/en/support/account/key-selling-points-features/lowest-trading-fees",
  agreement: "https://files.raseedinvest.com/disclosures/library/Raseed-Securities-Customer-Agreement.pdf",
  readOn: "2026-10-21",
  entity: "Raseed Invest Limited (DIFC); Fullerverse (SC) Limited",
  rule606: "raseed",
};

const RATE = 0.005;
const MIN = 0.5;
const MAX = 3;
const LISTED = new Set(["XNAS", "XNYS", "TXSE", "ARCX", "XASE", "BATS"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// 0.5% of the trade, between $0.50 and $3.00.
export function commissionSide(notional) {
  const value = Number(notional);
  if (!(value > 0)) return null;
  return Number(Math.min(Math.max(value * RATE, MIN), MAX).toPrecision(12));
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
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
    cashCurrency: "USD",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Raseed n'existe pas encore : lancer `node brokers/raseed/raseed_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Raseed` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Raseed`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "raseed",
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
  const listed = LISTED.has(listing.mic) && listing.currency === "USD";
  const via606 = listed && qOf(SCHEDULE.rule606) != null;
  const quoted = listed
    ? usBookPerShare({ broker: SCHEDULE.rule606, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null })
    : book.leaf?.perShare ?? null;
  const marketPerShare = perShare ?? quoted;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `politique de frais Raseed Invest Limited (DIFC), relue le ${SCHEDULE.readOn} : actions et ETF US 0,5 % par ordre, ` +
      `minimum 0,50 $, maximum 3 $, à l'achat et à la vente ; même tarif en Basic et en Prime ; ` +
      `SEC, TAF et CAT non imprimées, laissées à 0`,
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
  const side = notionalUsd == null ? null : commissionSide(notionalUsd);
  const brokerFees = side == null ? null : side + side;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    listed ? (via606 ? "mélange 606" : "aucun courtier US nommé : NBBO coté") : "place du catalogue",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { buy: side, sell: side, rate: RATE, min: MIN, max: MAX, currency: "USD" },
    regulators: { sec: 0, taf: 0, cat: 0 },
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
      courtage: finite(brokerFees, 6),
      bourse: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        { ...SCHEDULE, rate: RATE, min: MIN, max: MAX, sec: 0, taf: 0, cat: 0, prime: "6.99 USD a month or 69.90 USD a year, same commission" },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/raseed/raseed_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $   (${out.commission?.buy} $ par sens)`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
