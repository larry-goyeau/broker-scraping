// What one round trip costs on iVestor: buy n shares at price p, sell them
// back at once, in dollars. iVestor is the Dubai Financial Market's own app
// and not a broker: orders are executed by the partner broker, xCube
// (X CUBE LLC, CMA category 1). Only DFM-listed securities are offered, in
// dirhams: shares, REITs and the two DFM ETFs. The same FAQ also names BHM
// Capital as a partner in one line and xCube as "the sole partner" in the
// next; BHM's DFM card (https://www.bhmuae.ae/pricing/, brokers/bhmuae) prints
// the same 0.125 % + 0.05 % + 0.05 % + 0.05 % + AED 10 order fee, VAT on all
// but the CMA line, so the round trip is the same money with either partner.
//
// Sources, read on 2026-10-21:
//   https://ivestor.ae/support/     "Is iVestor a broker?" (xCube executes),
//                                   "What markets can I view" (DFM only),
//                                   card charges (free account, no balance).
//   https://www.xcube.ae/support/   FAQ "What are xCube's trading commission
//                                   fees for DFM and/or ADX?"
//   https://www.xcube.ae/pricing/   commission calculator (DFM tab) and the
//                                   note "Broker commission has changed from
//                                   0.10% to 0.125% effective since 11/02/2026".
//
// DFM, each side, on the trade value (FAQ and calculator agree):
//   Brokerage fee   0.125 % + 5 % VAT       xCube's own line
//   DFM fee         0.05 %  + 5 % VAT
//   CMA fee         0.05 %, no VAT
//   CDS fee         0.05 %  + 5 % VAT
//   Order fee       AED 10  + 5 % VAT per executed order (the calculator
//                   books it under "Market Commission")
//   So 0.28625 % + AED 10.50 a side. No minimum, no cap.
//
// In the total: the DFM book (spreads/book.mjs), the five lines above on the
// buy and on the sell, and a tax when taxMap.mjs names one (none on DFM).
// `brokerFees` is xCube's brokerage line with its VAT; the DFM, CMA, CDS and
// order fees are market charges and sit in `parts.marketFees`.
// The account is in dirhams only (deposits.mjs) and every line is in AED,
// so there is no FX. Custody, account and statement are free; card and
// bank-transfer charges price moving money, not trading. No remark.
//
//   node brokers/ivestor/ivestor_cost.mjs EMAAR DFM AED --shares=100 --price=11.6
//   node brokers/ivestor/ivestor_cost.mjs DEWA DFM AED --shares=20000 --price=2.75
//   node brokers/ivestor/ivestor_cost.mjs CHAE DFM AED --shares=10 --price=6.97
//   node brokers/ivestor/ivestor_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("ivestor-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.xcube.ae/pricing/",
  faq: "https://www.xcube.ae/support/",
  app: "https://ivestor.ae/support/",
  readOn: "2026-10-21",
  brokerRateFrom: "2026-02-11",
  entity: "X CUBE LLC (AE, CMA), partner broker of iVestor",
};

const VAT = 0.05;
const LINES = [
  { name: "BROKER", rate: 0.00125, vat: VAT },
  { name: "DFM", rate: 0.0005, vat: VAT },
  { name: "CMA", rate: 0.0005, vat: 0 },
  { name: "CDS", rate: 0.0005, vat: VAT },
];
const ORDER_FEE = 10;
const ORDER_FEE_VAT = VAT;
const CCY = "AED";

const RATE = LINES.reduce((sum, l) => sum + l.rate * (1 + l.vat), 0);
const BROKER_RATE = LINES.filter((l) => l.name === "BROKER").reduce((sum, l) => sum + l.rate * (1 + l.vat), 0);
const TICKET = ORDER_FEE * (1 + ORDER_FEE_VAT);

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
    cashCurrency: CCY,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue iVestor n'existe pas encore : lancer `node brokers/ivestor/ivestor_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue iVestor` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez iVestor`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "ivestor",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `barème xCube DFM lu le ${SCHEDULE.readOn} (FAQ et calculateur xcube.ae) : courtage 0,125 % + TVA ` +
      `(depuis le 11/02/2026), DFM 0,05 % + TVA, CMA 0,05 %, CDS 0,05 % + TVA, frais d'ordre 10 AED + TVA, chaque sens, sans minimum.`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  if (listing.currency !== CCY) {
    return { ...shared, why: `ligne en ${listing.currency} : le barème xCube ne tarife que le DFM en dirhams` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * RATE + TICKET;
  const brokerEach = notional * BROKER_RATE;
  const feesUsd = dollars(each * 2, listing.currency);
  const brokerFees = dollars(brokerEach * 2, listing.currency);
  const marketFees = dollars((each - brokerEach) * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, feesUsd, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      rate: RATE,
      brokerRate: BROKER_RATE,
      ticket: TICKET,
      each,
      currency: listing.currency,
      eachWay: true,
      lines: LINES,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      marketFees: finite(marketFees, 6),
      taxes: taxTotal ? finite(taxUsd, 6) : null,
    },
    confidence: [
      shared.basis,
      `${(RATE * 100).toFixed(5)} % de ${notional.toFixed(2)} AED + 10,50 AED = ${each.toFixed(4)} AED par sens`,
      marketPerShare != null
        ? `carnet ${marketPerShare} par part`
        : marketBp != null
          ? `carnet ${marketBp} pb`
          : `pas de feuille de carnet : ${listing.exchange}`,
      "aucun aller-retour réel iVestor dans ce dépôt",
    ].join(" ; "),
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, lines: LINES, orderFee: ORDER_FEE, orderFeeVat: ORDER_FEE_VAT, rate: RATE, ticket: TICKET, currency: CCY, eachWay: true }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/ivestor/ivestor_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    return;
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency} (${t.notionalUsd} $)\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    for (const [name, v] of Object.entries(out.parts || {})) if (v) console.log(`  ${name.padEnd(15)}: ${v} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
