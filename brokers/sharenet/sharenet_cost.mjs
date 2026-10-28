// What one round trip costs at Sharenet Securities (Cape Town, ZA): buy n
// shares of a JSE line online and sell them back, in dollars. Every line of
// the catalogue is a JSE share, ETF or ETN in rand, and the account takes
// rand by EFT (deposits.mjs ZAR), so nothing is converted.
//
// Read on 2026-10-26 (plain fetch, no login):
//   https://www.sharenet.co.za/securities/costs.php
//     "Standard fees (excl VAT): 30 basis points (0.3%) or R100 minimum;
//     whichever is larger. A monthly administration fee of R96 applies to
//     all accounts. The commission is calculated per order executed."
//   https://www.sharenet.co.za/securities/trade-jse.php
//     ONLINE TRADER "0.3% Brokerage (R100 min) R96* Monthly Fee"
//     CLASSIC TRADER "0.5% Brokerage (R100 min) R96* Monthly Fee",
//     "+ Includes all Online Features", plus phone-in execution and the
//     dealing desk. Two packages with their own rate, so two plans
//     (`query.plan`: online, the default, and classic).
//   The page's own cost calculator (https://www.sharenet.co.za/v3/frontend/
//   securities/functions/cost_calc.php?action=buy&value=100000&bcode=68)
//   prints, for the Online Trader rate:
//     buy  R100 000: 0.3% Commission R300, 15% VAT R45,
//                    0.25% Securities Transfer Tax R250, total R595
//     buy  R10 000:  Commission R100 (the minimum), VAT R15, STT R25
//     sell R100 000: Commission R300, VAT R45, total R345
//   and nothing else: no STRATE, settlement or investor protection levy line.
//
// Formula, each side: max(rate x value, R100) + 15% VAT; on a STOCK buy the
// 0.25% securities transfer tax as well (the calculator charges it on every
// buy; the STT Act does not tax ETF participatory interests or ETN debt, so
// ETFs and ETNs pay none). A UK or Irish share bought on the JSE settles in
// Strate and pays STT, not UK/Irish stamp, so taxMap stamp lines are dropped
// here; any other taxMap line (FTT) is added.
// Left out: the R96 + VAT monthly administration fee (a holding cost, in the
// remark), data and research subscriptions, the R120 outgoing transfer fee
// per counter, the minimum account sizes (R50 000 / R200 000), phone-in
// orders, and the Trade International platform (another tariff, not in the
// catalogue).
//
//   node brokers/sharenet/sharenet_cost.mjs NPN JSE ZAR --shares=5 --price=3600
//   node brokers/sharenet/sharenet_cost.mjs STX40 JSE ZAR --shares=200 --price=90 --plan=classic
//   node brokers/sharenet/sharenet_cost.mjs --schedule
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

const FOLDER = "sharenet";
const CATALOGUE = new URL("sharenet-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.sharenet.co.za/securities/costs.php",
  packages: "https://www.sharenet.co.za/securities/trade-jse.php",
  calculator: "https://www.sharenet.co.za/v3/frontend/securities/functions/cost_calc.php",
  readOn: "2026-10-26",
  entity: "Sharenet Securities (Pty) Ltd, FSP 28430, JSE member (ZA)",
  defaultPlan: "online",
  plans: {
    online: { label: "Online Trader", rate: 0.003 },
    classic: { label: "Classic Trader", rate: 0.005 },
  },
};

const MIN_ZAR = 100;
const VAT = 0.15;
const STT = 0.0025;
const CASH = "ZAR";
const REMARK = "Admin fee R96 a month plus VAT.";
const STAMP = /STAMP|IRISH/i;

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

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

// The buy-side taxes on the JSE: STT on a share, plus any non-stamp line of
// the tax map (a UK/Irish share bought here settles in Strate, no stamp).
function jseTaxes(listing, tax) {
  const rates = Object.fromEntries(Object.entries(taxRates(tax)).filter(([name]) => !STAMP.test(name)));
  if (listing.type === "STOCK" && !Object.keys(rates).some((name) => /STT|TRANSFER_TAX/i.test(name))) rates.STT = STT;
  return rates;
}

/** One side in rand: commission at the plan rate, R100 floor, plus 15% VAT. */
export function commissionSide(notional, rate) {
  const commission = Math.max(notional * rate, MIN_ZAR);
  return { commission, vat: commission * VAT, charged: commission * (1 + VAT), floored: notional * rate < MIN_ZAR };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const chosen = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: chosen?.id ?? plan,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!chosen) return { ...answer, why: `formule Sharenet inconnue : ${plan} (online ou classic)` };
  const rate = SCHEDULE.plans[chosen.id].rate;
  if (!catalogue) {
    return { ...answer, why: "le catalogue Sharenet n'existe pas encore : lancer `node brokers/sharenet/sharenet_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Sharenet` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Sharenet`,
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
  const rates = jseTaxes(listing, tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const label = SCHEDULE.plans[chosen.id].label;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis:
      `pages Costs et Trade JSE et calculateur de coûts relus le ${SCHEDULE.readOn} : ${label} ` +
      `${(rate * 100).toFixed(1)} % ou 100 R minimum par ordre, + TVA 15 %, STT 0,25 % sur un achat d'action`,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `Sharenet ne vend que le JSE en rand ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, CASH);
  const side = commissionSide(notional, rate);
  const brokerFees = dollars(side.charged * 2, CASH);
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
    side.floored
      ? `le minimum mord : ${(notional * rate).toFixed(2)} ZAR calculés, 100 ZAR + TVA = ${side.charged.toFixed(2)} ZAR par sens`
      : `${(rate * 100).toFixed(1)} % de ${notional.toFixed(2)} ZAR = ${side.commission.toFixed(2)} ZAR + TVA = ${side.charged.toFixed(2)} ZAR par sens`,
    taxPct
      ? `taxe à l'achat ${Object.entries(rates).map(([k, r]) => `${k} ${(r * 100).toFixed(2)} %`).join(" + ")}`
      : "pas de STT (ETF / ETN)",
    "frais d'administration 96 R / mois + TVA en remarque",
    marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    commission: { rate, min: MIN_ZAR, vat: VAT, eachWay: true, currency: CASH },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: { native: side, taxRates: Object.keys(rates).length ? rates : null },
    sell: { native: side },
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
    console.log(JSON.stringify({ ...SCHEDULE, minZar: MIN_ZAR, vat: VAT, stt: STT }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/sharenet/sharenet_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=online|classic]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    plan: flag("plan"),
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
