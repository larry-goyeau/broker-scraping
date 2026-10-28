// What one round trip costs at Agram Brokeri d.d. (Zagreb, Croatia): buy n
// shares or ETF units on the Zagreb Stock Exchange in Agram Trader (internet
// trading) and sell them back, in dollars. Every line is a ZSE listing in
// euro, and the brokerage account takes euro, so nothing is converted.
// Two commission models with their own prices, so two plans (`query.plan`):
// "model1" (the default) and "model2".
//
// https://www.agram-brokeri.hr/UserDocsImages/Arhiva/UserDocsImages/Dokumenti%20za%20euro/Cjenik%20usluga%2027.11.2024.pdf
// "Cjenik usluga (na snazi od 27.11.2024.)", read on 2026-10-26.
// "DOMAĆE TRŽIŠTE - DIONICE", "A.) INTERNET TRGOVANJE", each order:
//   MODEL 1: "MINIMALNA PROVIZIJA 3,33 EUR"; by the client's average daily
//     turnover ("DNEVNI PROMET") of the previous month:
//       "DO 1.500,00 EUR"              0,40 % IZNOSA TRANSAKCIJE
//       "1.500,00 EUR – 3.000,00 EUR"   0,35 %
//       "VEĆI OD 3.000,00 EUR"          0,30 %
//     "Novi klijenti započinju trgovanje internetom u razredu provizije
//     0,3%" (first month only). A client trading ~1,000 USD a few times a
//     month averages far under 1,500 EUR a day, so the total uses 0.40% and
//     the lower classes go to the remark, as a cut of this order's
//     commission with the 3.33 EUR minimum (at the bare rates, 0.35% is
//     13% lower and 0.30% 25%; on a 925 EUR order the minimum leaves 10%).
//   MODEL 2: "4,27 EUR + 0,27%".
//   "Klijenti koji ne odaberu promjenu modela obračuna, razvrstani su u
//   MODEL 1." The minimum (Model 1) and the fixed part (Model 2) are charged
//   once per order, not per partial fill.
// "Brokerske provizije navedene u Cjeniku uključuju sve troškove Zagrebačke
// burze, SKDD-a i SKDD-CCP-a!": no exchange or depository fee on top.
// "Naknada za otvaranje i održavanje osnovnog računa ulagatelja – 0,00 EUR"
// and "Naknada za korištenje internetske platforme Agram Trader – 0,00 EUR":
// no custody or platform fee on the ordinary account. Croatia has no
// transaction tax on shares.
// Left out: "B.) TELEFONSKI I OSOBNO" (1.50% down to 0.80%, minimum
// 19.90 EUR) is not an online order; rights (0.80%) and bonds are priced
// apart and are not in the catalogue; the custody-service and transaction-
// account fees (IX) belong to other account types; early payout of sale
// proceeds (VI) is optional.
//
// Formula: commission per side = max(0.40% × notional, 3.33 €) (Model 1)
// or 4.27 € + 0.27% × notional (Model 2), twice, plus the ZSE book.
//
//   node brokers/agrambrokeri/agrambrokeri_cost.mjs HT ZSE EUR --shares=25 --price=37
//   node brokers/agrambrokeri/agrambrokeri_cost.mjs HT ZSE EUR --shares=25 --price=37 --plan=model2
//   node brokers/agrambrokeri/agrambrokeri_cost.mjs --schedule
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

const FOLDER = "agrambrokeri";
const CATALOGUE = new URL("agrambrokeri-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.agram-brokeri.hr/UserDocsImages/Arhiva/UserDocsImages/Dokumenti%20za%20euro/Cjenik%20usluga%2027.11.2024.pdf",
  inForce: "2024-11-27",
  readOn: "2026-10-26",
  entity: "Agram Brokeri d.d., Agram Trader",
  defaultPlan: "model1",
};

const CASH = "EUR";
const READ = `Cjenik usluga du ${SCHEDULE.inForce}, relu le ${SCHEDULE.readOn}, Domaće tržište – dionice, internet trgovanje`;

// Model 1's cheaper turnover classes as a cut of this order's commission,
// minimum included; at the bare rates when no order is known.
const MODEL1_MIN = 3.33;
const cut = (x) => (x >= 10 ? Math.round(x + 1e-9) : Number((x + 1e-9).toFixed(1)));
function classRemark(notional) {
  const side = (rate) => (notional > 0 ? Math.max(notional * rate, MODEL1_MIN) : rate);
  const base = side(0.004);
  const mid = cut((100 * (base - side(0.0035))) / base);
  const top = cut((100 * (base - side(0.003))) / base);
  if (!(top > 0)) return "";
  return `Average daily turnover over 1,500 €: fees are ${mid}% lower; over 3,000 € or first month: ${top}% lower.`;
}

const PLAN_TABLE = {
  model1: {
    label: "Model 1",
    rate: 0.004,
    fixed: 0,
    min: MODEL1_MIN,
    remark: classRemark,
    basis:
      `${READ}, Model 1 : 0,40 % par ordre (classe de chiffre d'affaires quotidien jusqu'à 1 500 €), minimum 3,33 €, ` +
      `à l'achat et à la vente ; 0,35 % / 0,30 % au-delà de 1 500 € / 3 000 € par jour ; frais ZSE, SKDD et SKDD-CCP inclus`,
  },
  model2: {
    label: "Model 2",
    rate: 0.0027,
    fixed: 4.27,
    min: 0,
    remark: () => "",
    basis: `${READ}, Model 2 : 4,27 € + 0,27 % par ordre, à l'achat et à la vente ; frais ZSE, SKDD et SKDD-CCP inclus`,
  },
};

export const PLANS = Object.fromEntries(Object.entries(PLAN_TABLE).map(([id, p]) => [id, { id, label: p.label }]));
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

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = SCHEDULE.defaultPlan }) {
  const chosen = planOf(plan) || PLANS[SCHEDULE.defaultPlan];
  const fee = PLAN_TABLE[chosen.id];
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: chosen.id,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.url,
    remark: fee.remark(null),
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Agram Brokeri n'existe pas encore : lancer `node brokers/agrambrokeri/agrambrokeri_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Agram Brokeri` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Agram Brokeri`,
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
    basis: fee.basis,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `Agram Trader ne vend que la ZSE en euro ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, CASH);
  const computed = fee.fixed + notional * fee.rate;
  const side = Math.max(computed, fee.min);
  const floorBites = computed < fee.min;
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
      ? `le minimum de ${fee.min.toFixed(2)} € mord (${computed.toFixed(2)} € calculés)`
      : chosen.id === "model2"
        ? `4,27 € + 0,27 % de ${notional.toFixed(2)} € = ${side.toFixed(2)} € par sens`
        : `0,40 % de ${notional.toFixed(2)} € = ${side.toFixed(2)} € par sens`,
    "compte en euro, ligne en euro : pas de change",
    "compte de base et plateforme gratuits",
    marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    remark: fee.remark(notional),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    commission: { rate: fee.rate, fixed: fee.fixed, min: fee.min, minCurrency: CASH, eachWay: true, currency: CASH },
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
    const plans = Object.fromEntries(Object.entries(PLAN_TABLE).map(([id, p]) => [id, { ...p, remark: p.remark(null) }]));
    console.log(JSON.stringify({ ...SCHEDULE, plans }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error(
      "usage : node brokers/agrambrokeri/agrambrokeri_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=model1|model2]"
    );
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    plan: flag("plan") || SCHEDULE.defaultPlan,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
