// What one round trip costs at Wealthyhood Europe AEPEY (Greece): buy n
// shares at price p in the app, sell them straight back, in dollars. The
// account is held in euros only (deposits.mjs).
//
// Read on 2026-10-19:
//   https://wealthyhood.com/eu/pricing/                    "Our fees" card
//   https://wealthyhood.com/eu/help-centre/plans-pricing-faq/
//   https://wealthyhood.com/eu/help-centre/investments-orders-faq/
//   https://wealthyhood.com/eu/terms/                      clauses 10.5-10.8, 13
// The pricing page's "Our fees" card has two tabs. The ETF tab renders from
// the page's own script bundle, which also carries the fee constants the
// card and the plan pages print (FX_RATES, MINIMUM_FX_FEE,
// REAL_TIME_ETF_EXECUTION_FEES, COMMISSION_RATES).
//
//   Stocks     US stocks             €0
//              Greek stocks          0.15 % each side
//              Cypriot stocks        0.15 % each side
//              other EU & UK stocks  no row, "commission-free" (COMMISSION_RATES 0)
//   ETFs       EU & UK               Smart Execution ON €0, OFF €1 an order
//              Greece (Athens)       0.15 % ON ("no stock exchange fees"),
//                                    0.15 % OFF ("stock exchange fees apply")
//   FX         Basic 0.55 %, Plus 0.35 %, Gold 0.25 % on the converted
//              amount, at least €0.01, each conversion. The plan pages print
//              "as low as 0,35% for Plus and 0,25% for Gold".
//   Plans      Basic €0, Plus €2.99/month, Gold €12.99/month. They differ
//              only on FX, so `plan` picks the rate and the remark carries
//              the subscription.
//
// Smart Execution trades in a daily window. It is open to ETF buys and to
// buys and sells of "selected stocks"; an ETF sell is always Real-time
// (Express). So an ETF trip is a Smart buy (€0) and a Real-time sell (€1),
// and a stock trip is two Smart orders, which the card says carry no
// exchange fee. A Greek ETF sale is Real-time, where "stock exchange fees
// apply" and are not printed: that line is N/A.
//
// A non-euro line converts on the buy and again on the sale, at the plan's
// rate, and that is in the total. The euro is the only cash, so a euro line
// has no FX and no FX remark. Stamp and FTT come from taxMap.mjs. No US
// dealer is named (orders go "to a third-party broker"), so a US line is
// priced on the quoted NBBO; the SEC fee and TAF are not printed and stay 0.
// Card deposits over €2,500 pay 0.75 %; a bank transfer is free and is the
// funding assumed here.
//
//   node brokers/wealthyhoodgr/wealthyhoodgr_cost.mjs AAPL XNAS USD --shares=2 --price=230
//   node brokers/wealthyhoodgr/wealthyhoodgr_cost.mjs VWCE XETR EUR --shares=3 --price=130 --plan=gold
//   node brokers/wealthyhoodgr/wealthyhoodgr_cost.mjs OPAP XATH EUR --shares=10 --price=17
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "wealthyhoodgr";
const CATALOGUE = new URL("wealthyhoodgr-parsed.json", import.meta.url);
const PAGE = "https://wealthyhood.com/eu/pricing/";
const READ_ON = "2026-10-19";
const CASH = "EUR";
const FX_MIN_EUR = 0.01;
const ETF_REALTIME_EUR = 1;
const GREEK_RATE = 0.0015;

const PLANS = {
  basic: { id: "basic", label: "Basic", fx: 0.0055, remark: "" },
  plus: { id: "plus", label: "Plus", fx: 0.0035, remark: "€2.99/month." },
  gold: { id: "gold", label: "Gold", fx: 0.0025, remark: "€12.99/month." },
};
const DEFAULT_PLAN = "basic";

const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "OTCM"]);
const GREEK = new Set(["XATH"]);
const CYPRIOT = new Set(["XCYS"]);
const EU_UK = new Set(["XETR", "XFRA", "XLON", "XPAR", "XAMS", "XBRU", "XLIS", "XMIL", "XMAD", "XSWX"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const fund = (type) => ["ETF", "ETC", "ETN"].includes(code(type));

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || DEFAULT_PLAN).trim().toLowerCase();
  return PLANS[key] || null;
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
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// The commission legs, in euros or as a rate, for this place and type.
// `unknown` names a leg the card says exists and does not price.
function legsOf(mic, type) {
  if (US_MICS.has(mic)) return { rate: 0, flatEur: 0, smart: "achat et vente Smart ou Real-time, 0 €" };
  if (GREEK.has(mic) || CYPRIOT.has(mic)) {
    if (fund(type)) {
      return {
        rate: GREEK_RATE,
        flatEur: 0,
        unknown: "vente d'ETF à Athènes en Real-time : « stock exchange fees apply », montant non publié",
      };
    }
    return { rate: GREEK_RATE, flatEur: 0, smart: "achat et vente Smart, 0,15 % chaque sens, sans frais de bourse" };
  }
  if (EU_UK.has(mic)) {
    if (fund(type)) return { rate: 0, flatEur: ETF_REALTIME_EUR, smart: "achat Smart 0 €, vente Real-time 1 €" };
    return { rate: 0, flatEur: 0, smart: "achat et vente Smart, 0 €, sans frais de bourse" };
  }
  return null;
}

function remarkOf(plan, listing, mic, type, rowRemark) {
  const parts = [];
  if (EU_UK.has(mic) && fund(type)) parts.push("Real-time buy is €1 more.");
  if (plan.remark) parts.push(plan.remark);
  if (rowRemark) parts.push(rowRemark);
  return parts.join(" ");
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: CASH,
    url: PAGE,
    remark: "",
  };
  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (basic|plus|gold)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Wealthyhood n'existe pas encore : lancer `node brokers/wealthyhoodgr/wealthyhoodgr_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Wealthyhood` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Wealthyhood`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
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
  const mic = m.venue?.mic ?? code(m.row.mic);
  const legs = legsOf(mic, listing.type);
  const held = depositHas(FOLDER, null, listingCash(listing.currency));
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    remark: remarkOf(picked, listing, mic, listing.type, m.row.remark),
    basis:
      `Wealthyhood ${picked.label}, carte « Our fees » relue le ${READ_ON}. ` +
      (legs?.smart ? `${legs.smart[0].toUpperCase()}${legs.smart.slice(1)}. ` : "") +
      (held ? "Ligne en euros : pas de change." : `Change ${(picked.fx * 100).toFixed(2).replace(".", ",")} % à l'achat et à la vente, plancher 0,01 €.`),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: picked.fx,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!legs) return { ...shared, why: `pas de courtage publié pour ${listing.exchange}` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const eurUsd = usdPer(CASH);
  const notionalEur = notionalUsd == null || !(eurUsd > 0) ? null : notionalUsd / eurUsd;
  if (notionalUsd == null || notionalEur == null) {
    return { ...shared, why: `aucun cours en dollars pour ${listing.currency} dans fx.mjs` };
  }

  const commissionUsd = notionalUsd * legs.rate * 2 + dollars(legs.flatEur, CASH);
  const fxEachEur = held ? 0 : Math.max(FX_MIN_EUR, notionalEur * picked.fx);
  const fxUsd = dollars(fxEachEur * 2, CASH);
  const brokerFees = plus(commissionUsd, fxUsd);
  const tax = taxesOf(listing.isin);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const taxUsd = gap ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd = parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const exchangeUsd = legs.unknown ? null : 0;
  const usd = plus(bookUsd, brokerFees, taxUsd, exchangeUsd);
  const why = [
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
    legs.unknown || null,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null && why.length ? { why: why.join(" ; ") } : {}),
    tax,
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      rate: legs.rate,
      eachWay: true,
      flatEur: legs.flatEur,
      fx: held ? 0 : picked.fx,
      fxMinEur: held ? 0 : FX_MIN_EUR,
      plan: picked.id,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
      bourse: exchangeUsd,
    },
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(arg("shares", "10")),
        price: Number(arg("price", "0")),
        plan: arg("plan", DEFAULT_PLAN),
      }),
      null,
      2
    )
  );
}

printCli();
