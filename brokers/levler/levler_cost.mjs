// What one round trip costs at Levler: buy n shares at price p, sell them
// back at once, in dollars.
//
// Two plans, re-read 2026-09-27 on the price list. Default is Standard.
// Plus is the same tickets at zero, plus a custody charge that is not a
// trade fee and so stays out of the number.
//
//   Standard, the class the list itself calls cheapest for the size.
//   The account picks one class and can change it at will, so the bill is
//   the lowest of the four, each way.
//     Sweden, Denmark, Norway
//       Mini    0.18 %, floor 1
//       Small   0.11 %, floor 29
//       Medium  0.05 %, floor 52
//       Fast    74 flat
//       in SEK, DKK or NOK
//     USA, Germany, Netherlands
//       Mini    0.18 %, floor 1
//       Small   0.11 %, floor 6
//       Medium  0.07 %, floor 8
//       Fast    9 flat
//       in USD or EUR. The top line is printed "lägst 9" with no rate.
//       0.07 % of 12 857 is exactly 9, and above that a flat 9 is what
//       "bäst för affärer över 12 857" describes.
//   Plus
//     stocks and ETFs     0
//     custody             0.35 % a year of the whole account, not in the total
//   both
//     FX                  0.19 % a conversion, stocks and ETFs
//     cash                SEK only, so a foreign line converts twice
//     Levler's own ETFs   0 commission on Standard through 31 Dec 2026
//
// Phone orders are a different ticket and are not this one. Funds,
// certificates and crypto are not in the catalogue. No stamp is added
// beyond the tax map. The price list does not name a US regulatory levy.
//
//   https://levler.se/om-oss/prislista/
//
//   node brokers/levler/levler_cost.mjs INVEB --shares=10 --price=400
//   node brokers/levler/levler_cost.mjs AAPL --shares=1 --price=230
//   node brokers/levler/levler_cost.mjs AAPL --plan=plus --shares=1 --price=230
//   node brokers/levler/levler_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("levler-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);

const SCHEDULE = {
  url: "https://levler.se/om-oss/prislista/",
  readOn: "2026-09-27",
  entity: "Levler",
};

const DEFAULT_PLAN = "standard";
const FX_RATE = 0.0019;
const CUSTODY = 0.0035;
const LEVLER_ETF_FREE_UNTIL = "2026-12-31";

// Floors and the flat ticket are in the market's own currency.
const CLASSES = {
  se: [
    { id: "mini", rate: 0.0018, min: 1 },
    { id: "small", rate: 0.0011, min: 29 },
    { id: "medium", rate: 0.0005, min: 52 },
    { id: "fast", flat: 74 },
  ],
  dk: [
    { id: "mini", rate: 0.0018, min: 1 },
    { id: "small", rate: 0.0011, min: 29 },
    { id: "medium", rate: 0.0005, min: 52 },
    { id: "fast", flat: 74 },
  ],
  no: [
    { id: "mini", rate: 0.0018, min: 1 },
    { id: "small", rate: 0.0011, min: 29 },
    { id: "medium", rate: 0.0005, min: 52 },
    { id: "fast", flat: 74 },
  ],
  us: [
    { id: "mini", rate: 0.0018, min: 1 },
    { id: "small", rate: 0.0011, min: 6 },
    { id: "medium", rate: 0.0007, min: 8 },
    { id: "fast", flat: 9 },
  ],
  de: [
    { id: "mini", rate: 0.0018, min: 1 },
    { id: "small", rate: 0.0011, min: 6 },
    { id: "medium", rate: 0.0007, min: 8 },
    { id: "fast", flat: 9 },
  ],
  nl: [
    { id: "mini", rate: 0.0018, min: 1 },
    { id: "small", rate: 0.0011, min: 6 },
    { id: "medium", rate: 0.0007, min: 8 },
    { id: "fast", flat: 9 },
  ],
};

const MARKET_CCY = { se: "SEK", dk: "DKK", no: "NOK", us: "USD", de: "EUR", nl: "EUR" };
const MIC_MARKET = {
  XSTO: "se",
  SSME: "se",
  XCSE: "dk",
  XOSL: "no",
  XNAS: "us",
  XNYS: "us",
  XETR: "de",
  XAMS: "nl",
};

const PLANS = {
  standard: { id: "standard", label: "Levler Standard", free: false },
  plus: { id: "plus", label: "Levler Plus", free: true },
};

const PLAN_ALIAS = { standard: "standard", std: "standard", plus: "plus" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCcy = (amount, from, to) => {
  if (String(from || "").toUpperCase() === String(to || "").toUpperCase()) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(row, mic) {
  const code = String(mic || row?.exchange || "").toUpperCase();
  return MIC_MARKET[code] || null;
}

function classCost(amount, rule) {
  if (rule.flat != null) return rule.flat;
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  return Math.max(rule.min || 0, Number(amount) * (rule.rate || 0));
}

// The cheapest published class for this notional, in the market currency.
export function cheapestClass(market, amount) {
  const list = CLASSES[market];
  if (!list) return null;
  let best = null;
  for (const rule of list) {
    const fee = classCost(amount, rule);
    if (fee == null) continue;
    if (!best || fee < best.fee) best = { ...rule, fee, currency: MARKET_CCY[market] };
  }
  return best;
}

function levlerEtfFree(row) {
  if (String(row?.type || "").toUpperCase() !== "ETF") return false;
  if (!/^Levler\b/.test(String(row?.name || ""))) return false;
  return new Date().toISOString().slice(0, 10) <= LEVLER_ETF_FREE_UNTIL;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? listingKey({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

function taxParts(isin) {
  const tax = taxesOf(isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  return { tax, taxTotal };
}

function remarkOf({ plan, promo }) {
  const lines = [];
  if (plan.free) lines.push("Custody 0.35% a year on the whole account, not in this round trip.");
  if (promo) lines.push(`Commission 0 on Levler's own ETFs through ${LEVLER_ETF_FREE_UNTIL}.`);
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the commission and,
 * when the line is not in kronor, the conversion.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: "",
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (standard|plus)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Levler n'existe pas encore : lancer `node brokers/levler/levler_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Levler` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Levler`,
      alternatives: named
        .slice(0, 8)
        .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "levler",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? (String(m.row.exchange || "").toUpperCase() || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const market = feeMarketOf(m.row, listing.mic);
  const ticketCcy = MARKET_CCY[market] || null;
  const promo = !picked.free && levlerEtfFree(m.row);
  const holdSek = listing.currency === "SEK";
  const { tax, taxTotal } = taxParts(listing.isin);

  if (!market || !ticketCcy) {
    return { ...answer, listing, why: `pas de barre Levler pour ${listing.ticker || listing.isin}` };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: holdSek ? "SEK" : "",
    remark: remarkOf({ plan: picked, promo }),
    bp: marketBp,
    perShare: marketPerShare,
    url: SCHEDULE.url,
    basis: `barème ${picked.label}, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const native = toCcy(notional, listing.currency, ticketCcy);
  const chosen = promo || picked.free ? { id: promo ? "levler-etf" : "plus", fee: 0, flat: 0, currency: ticketCcy } : cheapestClass(market, native);
  const each = chosen?.fee ?? null;
  const commissionUsd = each == null ? null : dollars(each * 2, ticketCcy);
  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? dollars(marketPerShare * n, listing.currency)
        : null;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const fxUsd = holdSek || notionalUsd == null ? 0 : notionalUsd * FX_RATE * 2;
  const usd = plus(bookUsd, commissionUsd, taxUsd, fxUsd);
  const brokerFees = plus(commissionUsd, fxUsd);

  const klass = chosen?.id || "?";
  const confidence = [
    `barème ${picked.label} ${market} ${klass}, relu le ${SCHEDULE.readOn}`,
    each === 0
      ? "exécution 0"
      : chosen?.flat != null
        ? `ticket ${chosen.flat} ${ticketCcy} par jambe`
        : `${((chosen?.rate || 0) * 100).toFixed(2)} % par jambe` +
          (chosen?.min && each === chosen.min ? `, le plancher ${chosen.min} ${ticketCcy} mord` : ""),
    holdSek ? "ligne en SEK : pas de change" : `change ${(FX_RATE * 100).toFixed(2)} % × 2, dans le total`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      rate: chosen?.flat != null || each === 0 ? 0 : chosen?.rate || 0,
      min: chosen?.min || 0,
      flat: chosen?.flat ?? (each === 0 ? 0 : null),
      currency: ticketCcy,
      class: klass,
      eachWay: true,
      plan: picked.id,
    },
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
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, defaultPlan: DEFAULT_PLAN, fx: FX_RATE, custody: CUSTODY, classes: CLASSES }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node brokers/levler/levler_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=standard|plus]"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
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
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}  [${out.plan}]\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
