// What one round trip costs at SoFi Invest (Active Investing, the
// self-directed account of SoFi Securities LLC): buy n shares at price p,
// sell them back at once, in dollars, through the app or the website.
// Listed shares, ETFs, ETNs and OTC lines. Options, mutual funds, interval
// funds, IPO allocations and the robo account stay out.
//
// Read 2026-10-20. sofi.com answers a Cloudflare check to scripts, so the
// schedule is the Wayback copy of 2026-10-09 of the PDF the stock-trading
// page links as "fee schedule". It says "last updated 10/1/2026".
//   https://www.sofi.com/wealth/assets/documents/sofi-invest-fee-schedule.pdf
//   https://web.archive.org/web/20261009130814id_/https://www.sofi.com/wealth/assets/documents/sofi-invest-fee-schedule.pdf
//   https://www.sofi.com/invest/stock-trading/
//   https://www.sofi.com/rule-606-order-report/
//
//   US listed and OTC, ETFs included     $0 commission, app or website
//   ADRs                                 "some ADRs are subject to custody
//                                        fees", set by the depositary bank,
//                                        no figure. Not this trip.
//   IPO shares sold within 120 days      $50 the first sale, $5 the next.
//                                        Not this trip: the shares here are
//                                        bought on the market.
//   Regulatory Fee (SEC)                 $20.60 per $1,000,000 of principal,
//                                        on the sale. Under one cent it is
//                                        rounded up to one cent. Above, the
//                                        schedule says nothing: nearest cent.
//   TAF                                  Not on the 10/1/2026 schedule. The
//                                        9/17/2026 one printed $0.000195 a
//                                        share on equity sells, cap $9.79.
//                                        Unpublished, so $0 here.
//   CAT                                  Not printed in either. $0 here.
//   Inactivity                           $25 a 6 months without a login. Not
//                                        this trip.
//
// SoFi Securities files its own Rule 606 (rule606.mjs `sofi`, CRD 151717).
// A listed US line is that 605 times SoFi's Q. An OTC line has no 605: its
// book is the OTC Markets touch, as at Public. Cash is dollars only
// (deposits.mjs), and every line is in dollars, so there is no FX.
//
//   node brokers/sofi/sofi_cost.mjs AAPL Nasdaq USD --shares=10 --price=230
//   node brokers/sofi/sofi_cost.mjs SPY ARCX USD --shares=10 --price=600
//   node brokers/sofi/sofi_cost.mjs NSRGY OTC USD --shares=20 --price=95
//   node brokers/sofi/sofi_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { qOf } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("sofi-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.sofi.com/wealth/assets/documents/sofi-invest-fee-schedule.pdf",
  copy: "https://web.archive.org/web/20261009130814id_/https://www.sofi.com/wealth/assets/documents/sofi-invest-fee-schedule.pdf",
  routing: "https://www.sofi.com/rule-606-order-report/",
  readOn: "2026-10-20",
  scheduleOn: "2026-10-01",
  entity: "SoFi Securities LLC",
  rule606: "sofi",
};

const SEC = 20.6 / 1_000_000;
const TAF = 0;
const CAT = 0;
const TAF_DROPPED = { schedule: "2026-09-17", perShare: 0.000195, cap: 9.79 };
const CASH = "USD";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const isOtc = (row, mic) => mic === "OTCM" || /^OTC/i.test(String(row?.exchange || ""));

// Under one cent the fee is one cent. The schedule says no more, so a
// larger amount goes to the nearest cent.
function cents(value) {
  if (!(value > 0)) return 0;
  const nearest = Math.round(value * 100) / 100;
  return nearest < 0.01 ? 0.01 : nearest;
}

export function sellLevies(notional, shares) {
  return {
    sec: cents(notional * SEC),
    taf: cents(shares * TAF),
    cat: cents(shares * CAT),
  };
}

// The front passes the catalogue label ("Nasdaq", "OTC Markets"). A MIC or
// a short name ("ARCX", "OTC") is read too.
function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (wantPlace === "OTC" || wantPlace === "OTCMKTS") return isOtc(m.row, code(m.row.mic));
      if (wantPlace === "US") return isListedUsTape(m.venue?.mic ?? m.row.mic);
      return Boolean(wantVenue && m.venue && m.venue.mic === wantVenue.mic);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: plan || null,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue SoFi n'existe pas encore : lancer `node brokers/sofi/sofi_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue SoFi` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez SoFi`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const rowMic = m.venue?.mic ?? (code(m.row.mic) || null);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: rowMic,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sofi",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? rowMic,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  const otc = isOtc(m.row, listing.mic);
  const listed = !otc && isListedUsTape(listing.mic) && listing.currency === "USD";
  // A listed line is SoFi's 605 × Q (spreadLeaf asks rule606 for `sofi`).
  // An OTC line keeps the OTC Markets touch, in basis points.
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: listed && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const q = listed ? qOf("sofi") : null;
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème SoFi du ${SCHEDULE.scheduleOn} (copie Wayback du 2026-10-09), relu le ${SCHEDULE.readOn} : 0 $ par sens, cotés et OTC`,
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
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const sell = notionalUsd == null ? null : sellLevies(notionalUsd, n);
  const regulators = sell == null ? null : sell.sec + sell.taf + sell.cat;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, 0, regulators, taxUsd);
  const confidence = [
    shared.basis,
    otc ? "barème OTC (0 $)" : "barème coté (0 $)",
    `SEC 20,60 $ par million à la vente, un centime au minimum`,
    `TAF absente du barème du ${SCHEDULE.scheduleOn} (celui du ${TAF_DROPPED.schedule} imprimait ${TAF_DROPPED.perShare} $ la part, plafond ${TAF_DROPPED.cap} $) : 0`,
    "CAT non imprimé : 0",
    otc
      ? "OTC : pas de 605, carnet OTC Markets ; frais de garde d'ADR possibles, non chiffrés"
      : listed
        ? q != null
          ? `606 de SoFi Securities, Q ${q.toFixed(3)}`
          : "pas de Q SoFi : NBBO coté"
        : "place du catalogue",
    listed && marketPerShare != null
      ? `carnet 605 × Q SoFi, ${marketPerShare} $ la part`
      : marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : marketBp != null
          ? `carnet ${marketBp} bp`
          : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    "compte en dollars, ligne en dollars : pas de change",
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(0, 6),
    commission: { each: 0, currency: CASH, eachWay: true },
    regulators: sell,
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
      courtage: finite(0, 6),
      bourse: finite(regulators, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, commission: 0, sec: SEC, taf: TAF, cat: CAT, tafDropped: TAF_DROPPED }, null, 2));
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/sofi/sofi_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan"),
  });
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
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse) console.log(`  régulateur     : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
