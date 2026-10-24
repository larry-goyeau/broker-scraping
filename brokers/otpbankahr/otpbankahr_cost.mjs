// What one round trip costs at OTP banka d.d. (Croatia): buy n shares or
// ETF units on the Zagreb Stock Exchange in OTP e-trader and sell them back,
// in dollars. Every line is a ZSE listing in euro, and the cash account is
// in euro (deposits.mjs), so nothing is converted.
//
// https://www.otpbanka.hr/sw/static/file/Cjenikbrokerskihuslugauprimjeniod01.01.2026..pdf
// "Cjenik brokerskih usluga", u primjeni od 01.01.2026., the current one on
// https://www.otpbanka.hr/globalna-trzista/dokumenti-globalnih-trzista,
// read on 2026-10-23. Point 3, "Trgovanje putem interneta / OTP e-tr@der
// za vlasničke vrijednosne papire", each order (buy or sell):
//   3.1. Realizacija naloga putem e-brokerage sustava   0,50%
//   3.2. Minimalna naknada po nalogu                    10,00 EUR
//   "Cijene se odnose isključivo na vlasničke instrumente." ETFs are
//   equity instruments here (point 7 groups "dionicama i složenim
//   financijskim instrumentima (ETF)").
// Point 1 (phone, in person or in writing: 1.20% down to 0.50%, minimum
// 30 EUR) is not an online order and stays out. The tariff names no ZSE or
// SKDD fee on top of the e-trader rate, and the order and execution service
// is VAT-exempt ("oslobođena je plaćanja PDV-a"). Croatia has no transaction
// tax on shares.
// Holding: 5.1, "Naknada za vođenje transakcijskog računa ulagatelja"
// 0.02% a year + PDV, on month-end value: negligible, left out.
//
//   node brokers/otpbankahr/otpbankahr_cost.mjs HT ZSE EUR --shares=20 --price=43
//   node brokers/otpbankahr/otpbankahr_cost.mjs --schedule
//
// The ZSE has no book leaf yet, so the total stays unknown until one exists.
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "otpbankahr";
const CATALOGUE = new URL("otpbankahr-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.otpbanka.hr/sw/static/file/Cjenikbrokerskihuslugauprimjeniod01.01.2026..pdf",
  documents: "https://www.otpbanka.hr/globalna-trzista/dokumenti-globalnih-trzista",
  inForce: "2026-01-01",
  readOn: "2026-10-23",
  entity: "OTP banka d.d., OTP e-trader",
};

const RATE = 0.005;
const MIN_EUR = 10;
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

// Every row is ZSE; "ZSE", "XZAG" or the exchange's name all mean it.
const ZSE_CODES = new Set(["ZSE", "XZAG", "ZAGREB", "ZAGREBSTOCKEXCHANGE"]);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || ZSE_CODES.has(wantPlace) || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
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
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue OTP banka n'existe pas encore : lancer `node brokers/otpbankahr/otpbankahr_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue OTP banka` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez OTP banka`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
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
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis:
      `Cjenik brokerskih usluga du ${SCHEDULE.inForce}, relu le ${SCHEDULE.readOn}, point 3 OTP e-trader : ` +
      `0,50 % par ordre, minimum 10 €, à l'achat et à la vente ; aucun frais ZSE ou SKDD imprimé en sus`,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `OTP e-trader ne vend que la ZSE en euro ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, CASH);
  const side = Math.max(notional * RATE, MIN_EUR);
  const floorBites = notional * RATE < MIN_EUR;
  const brokerFees = dollars(side * 2, CASH);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, CASH),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    floorBites
      ? `le minimum de 10 € mord sous 2 000 € d'ordre (${(notional * RATE).toFixed(2)} € calculés)`
      : `0,50 % de ${notional.toFixed(2)} € = ${side.toFixed(2)} € par sens`,
    "compte en euro, ligne en euro : pas de change",
    "tenue du compte titres 0,02 % / an + TVA : négligeable, hors total",
    marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    commission: { rate: RATE, min: MIN_EUR, minCurrency: CASH, eachWay: true, currency: CASH },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, minEur: MIN_EUR }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/otpbankahr/otpbankahr_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
