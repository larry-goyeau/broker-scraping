// What one round trip costs at InvertirOnline: buy n shares at price p,
// sell them back at once, in dollars. Argentine shares and CEDEARs, and
// the US shares, ETFs and ADRs. Bonds, options, funds and cauciones stay
// out.
//
// Re-read 2026-10-10. The pages print no effective date. The older portal
// still shows Gold up to 3,000,000 pesos and a US line of 0.5% with a
// 5 dollar floor. That is not this ticket.
//   https://www.invertironline.com/tarifas
//   https://www.invertironline.com/tarifas-estados-unidos
//
//   Argentina, Gold     0.5% of the consideration, plus IVA. Platinum is
//                       0.3% and Black is 0.1%, from last month's volume.
//                       A new month with nothing traded is Gold.
//   Same-day sale       The Argentine sale of what was bought the same
//                       day, in the same symbol, currency and settlement,
//                       is free of commission. The figure assumes the sale
//                       is another day. The waiver is the remark.
//   Market rights       0.05% plus IVA on an Argentine share or CEDEAR,
//                       buy and sell. The waiver does not name them.
//   United States       0.35% plus IVA each execution, or 2 dollars plus
//                       IVA when that is more. Both executions. The page
//                       names no SEC, TAF or CAT.
//   IVA                 The pages say "+ IVA" and do not print the rate.
//                       It is the 21% rate those words mean.
//
// A dollar line is charged in the currency of the trade. Custody, a
// dividend, a CEDEAR issue and the ADR holding fee are not this order.
// A referred client can be charged up to 1%. That client is not this one.
// The US account is carried at Apex Clearing, so a US line takes Apex's Q.
// Cash in the trade can stay in that currency. Funding the US account
// from pesos is the CCL quote on AL30C. The panel of 2026-10-09 17:10
// was 1,609.1078 / 1,613.5644. Half that spread is the remark, and it
// is not in the figure.
//
//   node brokers/iol/iol_cost.mjs AAPL US USD --shares=10 --price=230
//   node brokers/iol/iol_cost.mjs AAPL BCBA ARS --shares=10 --price=27200
//   node brokers/iol/iol_cost.mjs AAPLD BCBA USD --shares=10 --price=17.61
//   node brokers/iol/iol_cost.mjs --schedule
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

const CATALOGUE = new URL("iol-parsed.json", import.meta.url);

const SCHEDULE = {
  argentina: "https://www.invertironline.com/tarifas",
  unitedStates: "https://www.invertironline.com/tarifas-estados-unidos",
  readOn: "2026-10-10",
  entity: "InvertirOnline S.A.U.",
};

const IVA = 0.21;
const GOLD = 0.005;
const MARKET = 0.0005;
const US_RATE = 0.0035;
const US_MIN = 2;
const REMARK = "If the sale is the same day, same symbol and currency, that sale has no commission. Above 7,500,000 pesos traded in Argentina last month, 0.3%. Above 50,000,000, 0.1%.";
// Dólar CCL, ley local (AL30C), compra then venta, 2026-10-09 17:10.
// Half the spread over the mid.
const CCL = [1609.1078, 1613.5644];
const FX_REMARK = `FX ${(((CCL[1] - CCL[0]) / (CCL[1] + CCL[0])) * 100).toFixed(3)}% when cash ≠ USD.`;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const withIva = (amount) => amount * (1 + IVA);

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
    cashCurrency: "",
    url: SCHEDULE.argentina,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue IOL n'existe pas encore : lancer `node brokers/iol/iol_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue IOL` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez IOL`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "iol",
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
  const american = listing.brokerExchange === "US";
  const quoted = american
    ? usBookPerShare({ broker: "iol", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null })
    : null;
  const marketPerShare = perShare ?? quoted ?? book.leaf?.perShare ?? null;
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
    cashCurrency: listing.currency,
    url: american ? SCHEDULE.unitedStates : SCHEDULE.argentina,
    remark: american ? FX_REMARK : REMARK,
    bp: marketBp,
    perShare: marketPerShare,
    basis: american
      ? `États-Unis, page relue le ${SCHEDULE.readOn} : 0,35 % + IVA par exécution, plancher 2 $ + IVA`
      : `Gold, page relue le ${SCHEDULE.readOn} : 0,5 % + IVA par exécution, droits 0,05 % + IVA des deux côtés`,
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
  const commission = american ? withIva(Math.max(notional * US_RATE, US_MIN)) * 2 : withIva(notional * GOLD) * 2;
  const rights = american ? 0 : withIva(notional * MARKET) * 2;
  const brokerFees = dollars(commission, listing.currency);
  const bourse = dollars(rights, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const confidence = [
    shared.basis,
    american ? "mélange 606 d'Apex Clearing" : "place BYMA",
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
    commission: american
      ? { rate: US_RATE, min: US_MIN, vat: IVA, currency: "USD", eachWay: true }
      : { rate: GOLD, vat: IVA, currency: listing.currency, eachWay: true },
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
    console.log(JSON.stringify({ ...SCHEDULE, gold: GOLD, market: MARKET, us: US_RATE, usMin: US_MIN, iva: IVA }, null, 2));
    return;
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/iol/iol_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.bourse) console.log(`  marché         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
