// What one round trip costs at Fintual Acciones: buy n shares at price p,
// sell them on a later day, in dollars. US shares and ETFs. Mutual-fund
// units are another product.
//
// Re-read 2026-10-11.
//   https://fintual.cl/comision-acciones/
//   https://ayuda.fintual.cl/es/articles/6960462-cual-es-la-comision-de-dolares
//
//   First 10 orders   no commission, each month. A round trip spends two,
//                     so this ticket is those two and the commission is 0.
//   From the 11th     0.1% of the order. That is the remark. The figure
//                     is the case the page gives away.
//   Dollars           4 Chilean pesos per dollar, on buying or selling
//                     the dollars. The share settles in dollars, so the
//                     pesos are not this order.
//
// The account is at Alpaca, so a US line uses that firm's Q. Alpaca
// passes SEC, TAF and CAT through and rounds each type up to the cent,
// per account, per day.
//   https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf
// The figure holds the position more than one day. The buy day pays CAT.
// The sell day pays SEC, TAF and CAT. Four cents on a small ticket. A
// same-day sale would share one day and pay three.
//
//   node brokers/fintual/fintual_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/fintual/fintual_cost.mjs SPY AMEX USD --shares=10 --price=500
//   node brokers/fintual/fintual_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("fintual-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://fintual.cl/comision-acciones/",
  dollars: "https://ayuda.fintual.cl/es/articles/6960462-cual-es-la-comision-de-dolares",
  readOn: "2026-10-11",
  dollarsOn: "2026-07-22",
  entity: "Fintual Administradora General de Fondos S.A.",
  rule606: "alpaca",
};

const FREE_ORDERS = 10;
const PAID_RATE = 0.001;
const VOLUME_USD = 500000;
const PESOS_PER_DOLLAR = 4;
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CAT_PER_SHARE = 0.000003;
const CAT_OTC_EQUIV = 0.01;
const CENT = 0.01;
const up = (value) => (value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0);
const isOverTheCounter = (row) => /^(OTC|PINK)/i.test(String(row?.exchange || ""));
// 4 pesos on the observed dollar is one way. The share is already in dollars.
const FX_PCT = (PESOS_PER_DOLLAR * usdPer("CLP") * 100).toFixed(3);
const REMARK = [
  "The first 10 orders each month have no commission.",
  "From the 11th, 0.1% of the order.",
  `FX ${FX_PCT}% when cash ≠ USD.`,
].join("\n");

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
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace)
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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Fintual n'existe pas encore : lancer `node brokers/fintual/fintual_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Fintual` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Fintual`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "fintual",
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
  const quoted = usBookPerShare({ broker: "fintual", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  const marketBp = bp ?? null;
  const marketPerShare = perShare ?? quoted;
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
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Fintual Acciones, relu le ${SCHEDULE.readOn} : 0 $ sur les ${FREE_ORDERS} premiers ordres du mois ; Alpaca arrondit SEC, TAF et CAT au centime par jour, vente un autre jour`,
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
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const otc = isOverTheCounter(m.row);
  const catLeg = n * CAT_PER_SHARE * (otc ? CAT_OTC_EQUIV : 1);
  const secRaw = notional * SEC_RATE;
  const tafRaw = Math.min(n * TAF_PER_SHARE, TAF_CAP);
  // The buy and the sale fall on different days, so each day's types are
  // rounded on their own. The buy day is CAT. The sell day is SEC, TAF and CAT.
  const regulatory = up(catLeg) + up(secRaw) + up(tafRaw) + up(catLeg);
  const usd = plus(bookUsd, regulatory, taxUsd);
  const confidence = [
    shared.basis,
    listing.type === "ETF" ? "barème ETF" : "barème action",
    "mélange 606 d'Alpaca Securities",
    `réglementaire ${regulatory.toFixed(2)} $ : CAT le jour de l'achat, SEC, TAF et CAT le jour de la vente`,
    `au-delà : ${(100 * PAID_RATE).toFixed(1)} % par ordre, moitié au-dessus de ${VOLUME_USD} $ d'ordres payants`,
    `change ${FX_PCT} % quand la caisse n'est pas en dollars, hors de ce ticket`,
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(0, 6),
    commission: { each: 0, currency: "USD", eachWay: true, freeOrders: FREE_ORDERS },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de 605 pour ce ticker"}` }
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
      réglementaire: finite(regulatory, 6),
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
    console.log(JSON.stringify({
      ...SCHEDULE,
      freeOrders: FREE_ORDERS,
      paidRate: PAID_RATE,
      halfAboveUsd: VOLUME_USD,
      pesosPerDollar: PESOS_PER_DOLLAR,
    }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/fintual/fintual_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
