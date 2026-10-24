// What one round trip costs at etfSA (ETFSA Investor Hub, DIY): buy n units
// of a JSE-listed exchange-traded product online and sell them back, in
// dollars. Every listing is a JSE ETF, AMETF, ETN or AMC in rand, and the
// account takes rand from a South African bank account (deposits.mjs ZAR),
// so nothing is converted.
//
// Read on 2026-10-23 in the local Chrome (the site is behind Cloudflare).
//   https://etfsa.co.za/product/diy/   "What does it cost?"
//     Brokerage                0.10% (ex. VAT) when buying and selling
//     Admin and client service 0.5% (ex. VAT)
//     Model Portfolios         0.25% (ex. VAT)
//     "*Our aggregate fee excludes VAT and underlying issuer charges."
//   https://etfsa.co.za/wp-content/uploads/2024/04/Investor-Hub-brochure-v1-June2024.pdf
//     "FEES ... Annual Management fee (annual) 0,50% of portfolio value;
//     Transaction costs (per transaction) 0,10% brokerage charge;
//     * These costs are all subject to VAT of 15%."
// So each buy and each sell pays 0.10% + 15% VAT = 0.115%. No minimum and no
// other per-trade charge (settlement, STRATE, levy) is printed; the model
// portfolio fee is another product. The 0.5% + VAT yearly admin fee is a
// holding cost, in the remark. No securities transfer tax applies to these
// products; a taxMap line would win.
//
//   node brokers/etfsa/etfsa_cost.mjs STX40 JSE ZAR --shares=10 --price=95
//   node brokers/etfsa/etfsa_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const FOLDER = "etfsa";
const CATALOGUE = new URL("etfsa-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://etfsa.co.za/product/diy/",
  brochure: "https://etfsa.co.za/wp-content/uploads/2024/04/Investor-Hub-brochure-v1-June2024.pdf",
  readOn: "2026-10-23",
  entity: "ETFSA Portfolio Management Company (Pty) Ltd, Investor Hub (Wealthport)",
};

const BROKERAGE = 0.001;
const VAT = 0.15;
const CASH = "ZAR";
const REMARK = "Admin fee 0.5% a year plus VAT.";

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
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
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
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue etfSA n'existe pas encore : lancer `node brokers/etfsa/etfsa_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue etfSA` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez etfSA`,
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
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis:
      `page DIY et brochure Investor Hub relues le ${SCHEDULE.readOn} : courtage 0,10 % + TVA 15 % à l'achat et à la vente, ` +
      `aucun minimum ni autre frais par ordre imprimé`,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `etfSA ne vend que des produits du JSE en rand ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, CASH);
  const side = notional * BROKERAGE * (1 + VAT);
  const brokerFees = dollars(side * 2, CASH);
  const taxUsd = gap ? null : notionalUsd == null ? null : notionalUsd * taxPct;
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
  const why = [
    bookUsd == null ? `aucun carnet pour ${listing.ticker} sur ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);
  const confidence = [
    shared.basis,
    `${(BROKERAGE * (1 + VAT) * 100).toFixed(3)} % de ${notional.toFixed(2)} ZAR = ${side.toFixed(2)} ZAR par sens`,
    "frais d'administration 0,5 % / an + TVA en remarque",
    marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    commission: { rate: BROKERAGE, vat: VAT, eachWay: true, currency: CASH },
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
    console.log(JSON.stringify({ ...SCHEDULE, brokerage: BROKERAGE, vat: VAT }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/etfsa/etfsa_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
