// What one round trip costs at BKS Bank Slovenia, on the individual
// investment account: buy n shares at price p and sell them straight
// back. The catalogue is that account's list. The answer is in dollars.
// `brokerFees` is what BKS keeps. The exchange, KDD and the foreign
// helper stay in `bourse`.
//
// INR tariff in force 13 March 2026, read 2026-10-10. Orders go through
// MyBroker. The card prints 0.30% and a 4 € floor. Every client in 2026
// has the printed 50% discount, so this trip is 0.15% and 2 €. A foreign
// execution also pays 3 €. That 3 € is not in the discount.
//
//   https://www.bksbank.si/fizicne-osebe/financni-instrumenti/inr-racun
//   https://www.bksbank.si/mbxs8qn54zwj/QQ1hL9hZ6f9Y7e1IBpTgb/7ee2898ac218d2e05d7efee32e39c581/CenikOPVP13032026_INR_final.pdf
//
// Ljubljana, each execution: the exchange 0.07% (2 € to 363 €), KDD
// 0.037% on the securities (0.38 € to 26.11 €) and 0.006% on the cash
// (0.20 € to 4.68 €). A worked example of five 1,000 € buys is 2 €, 2 €,
// 0.38 € and 0.20 €.
//
// Abroad, the Celovec helper's card is added. Xetra and Frankfurt are
// free at the helper and 0.012% at the exchange. The other German
// boards are 0.10% (min 3.50 €) plus 0.08% (min 0.75 €). The United
// States are 0.055% (min 15 €). London SETS is 0.03% (min 17 €).
// Croatia is the local helper, 0.20% and 14.60 €, which already
// includes the exchange. A place the card does not price keeps the
// BKS commission and the 3 € only.
//
// Stamp, the French, Italian and Spanish transaction taxes, and the
// British levy come from the tax table. The card names an American
// SEC fee on the sale and does not print the rate, so it is not added.
// No US broker-dealer is named, so a listed American line is the
// national quote. Cash on the securities account is euro. A purchase
// in another currency is converted at the bank's commercial rate. That
// rate is not printed, so it stays out of the figure.
//
//   node brokers/bks/bks_cost.mjs SXR8 XETR EUR --shares=10 --price=600
//   node brokers/bks/bks_cost.mjs AAPL XNYS USD --shares=10 --price=230
//   node brokers/bks/bks_cost.mjs CSPX XLON GBP --shares=10 --price=500
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("bks-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.bksbank.si/fizicne-osebe/financni-instrumenti/inr-racun",
  tariff: "https://www.bksbank.si/mbxs8qn54zwj/QQ1hL9hZ6f9Y7e1IBpTgb/7ee2898ac218d2e05d7efee32e39c581/CenikOPVP13032026_INR_final.pdf",
  readOn: "2026-10-10",
  asOf: "2026-03-13",
  entity: "BKS Bank AG, Bančna podružnica",
};

const RATE = 0.0015;
const MIN = 2;
const FOREIGN = 3;
const US = new Set(["XNYS", "XNAS", "XASE"]);

// One execution, in euros. `rate` is the helper, `exchange` the market,
// `sellRate` a levy the card puts on the sale only, `flat` a per-trade sum.
const ABROAD = {
  XWBO: { rate: 0 },
  XASX: { rate: 0.0012, min: 10 },
  XBRU: { rate: 0.0003, min: 9 },
  XPRA: { rate: 0.0012, min: 25 },
  XCSE: { rate: 0.0003, min: 25 },
  XHEL: { rate: 0.0003, min: 15 },
  XPAR: { rate: 0.0003, min: 9 },
  XATH: { rate: 0.0015, min: 10, sellRate: 0.002 },
  XTKS: { rate: 0.001, min: 25 },
  XTSE: { rate: 0.00085, min: 20 },
  XTSX: { rate: 0.00085, min: 20 },
  XCNQ: { rate: 0.00085, min: 20 },
  NEOE: { rate: 0.00085, min: 20 },
  XLUX: { rate: 0.0025, min: 25 },
  XBUD: { rate: 0.0015, min: 50 },
  XETR: { exchange: 0.00012 },
  XFRA: { exchange: 0.00012 },
  XSTU: { rate: 0.001, min: 3.5, exchange: 0.0008, exchangeMin: 0.75 },
  XMUN: { rate: 0.001, min: 3.5, exchange: 0.0008, exchangeMin: 0.75 },
  XHAM: { rate: 0.001, min: 3.5, exchange: 0.0008, exchangeMin: 0.75 },
  XQTX: { rate: 0.001, min: 3.5, exchange: 0.0008, exchangeMin: 0.75 },
  XAMS: { rate: 0.0003, min: 9 },
  XOSL: { rate: 0.0003, min: 25 },
  XNZE: { rate: 0.002, min: 40 },
  XLIS: { rate: 0.0003, min: 11 },
  XMAD: { rate: 0.0008, min: 10 },
  XSTO: { rate: 0.0003, min: 20 },
  XNGM: { rate: 0.0003, min: 20 },
  XSWX: { rate: 0.0003, min: 10 },
  XLON: { rate: 0.0003, min: 17 },
  XNYS: { rate: 0.00055, min: 15 },
  XNAS: { rate: 0.00055, min: 15 },
  XASE: { rate: 0.00055, min: 15 },
  OTCM: { rate: 0.00055, min: 15 },
  XZAG: { rate: 0.002, flat: 14.6 },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const euros = (amountUsd) => {
  const px = usdPer("EUR");
  return amountUsd == null || !px ? null : amountUsd / px;
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

function clamp(value, min, max) {
  let out = value;
  if (min != null) out = Math.max(out, min);
  if (max != null) out = Math.min(out, max);
  return out;
}

function ljubljana(notionalEur) {
  return (
    clamp(notionalEur * 0.0007, 2, 363) +
    clamp(notionalEur * 0.00037, 0.38, 26.11) +
    clamp(notionalEur * 0.00006, 0.2, 4.68)
  );
}

function abroad(exchange, notionalEur, sell) {
  const spec = ABROAD[exchange];
  if (!spec) return 0;
  let out = 0;
  if (spec.rate) out += Math.max(notionalEur * spec.rate, spec.min || 0);
  if (spec.flat) out += spec.flat;
  if (spec.exchange) out += Math.max(notionalEur * spec.exchange, spec.exchangeMin || 0);
  if (sell && spec.sellRate) out += notionalEur * spec.sellRate;
  return out;
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
    cashCurrency: "EUR",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue BKS n'existe pas encore : lancer `node brokers/bks/bks_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BKS` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BKS`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const exchange = m.row.exchange || "";
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "bks",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? exchange,
    currency: code(m.row.currency),
    brokerExchange: exchange,
  };
  const american = US.has(exchange);
  const quoted = american
    ? usBookPerShare({ broker: "bks", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null })
    : null;
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null && american ? { source: "us605" } : m.venue,
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
    basis: `tarif INR du ${SCHEDULE.asOf}, relu le ${SCHEDULE.readOn} : 0,15 % en ligne, minimum 2 €, et 3 € à l'étranger`,
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
  const notionalEur = euros(notionalUsd);
  if (notionalEur == null) return { ...shared, why: `${listing.currency} n'a pas de cours` };

  const home = exchange === "XLJU";
  const commission = Math.max(notionalEur * RATE, MIN);
  const ticket = home ? 0 : FOREIGN;
  const buyMarket = home ? ljubljana(notionalEur) : abroad(exchange, notionalEur, false);
  const sellMarket = home ? ljubljana(notionalEur) : abroad(exchange, notionalEur, true);
  const brokerEur = (commission + ticket) * 2;
  const marketEur = buyMarket + sellMarket;
  const brokerFees = dollars(brokerEur, "EUR");
  const bourse = dollars(marketEur, "EUR");
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const confidence = [
    shared.basis,
    home ? "Ljubljana, Bourse et KDD en plus" : ABROAD[exchange] ? "aide étrangère du barème de Celovec" : "place sans ligne dans le barème de Celovec",
    american ? "cours national, aucun broker-dealer américain nommé" : `place ${listing.exchange}`,
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
    commission: { rate: RATE, min: MIN, foreign: ticket, currency: "EUR", eachWay: true },
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
      bourse: finite(bourse, 6),
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
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, min: MIN, foreign: FOREIGN }, null, 2));
    return;
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/bks/bks_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse != null) console.log(`  bourse         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
