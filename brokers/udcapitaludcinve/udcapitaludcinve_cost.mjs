// What one round trip costs at UD Capital (AO "UD Capital", Almaty; app
// "UDC Invest"): buy n shares or fund units at price p on the Kazakhstan
// Stock Exchange (KASE, local boards and KASE Global), sell them back at
// once, in dollars.
//
// Read on 2026-10-26, "Тарифы АО "UD Capital" за оказание брокерских услуг
// и услуг номинального держания" (approved 22.07.2024):
//   https://udcapital.kz/downloads/files/brokerage-services/Tarify_na_BU_s_ND_21.08.2024.pdf
//
//   Сделки на локальном рынке, "Сделки с корпоративными ценными бумагами":
//     "0,3% от суммы сделки, не менее 3 МРП на биржевом рынке"
//     (0,5 %, min 6 MRP off the exchange: not an online order, left out)
//   "МРП – месячный расчетный показатель (на текущий год)": 4,325 KZT in
//     2026 (law on the 2026-2028 republican budget, art. 7), so the minimum
//     is 12,975 KZT per order and side.
//   Footnote 5: all deals of one client order, one instrument and one side
//     count as one for the minimum (one order each way here).
//   Конвертация денежных средств на бирже, USD-KZT, EUR-KZT, EUR-USD:
//     "0,1% от суммы сделки, не менее 10 000 тенге"
//   Учет ценных бумаг и ведение лицевого счета: "3 МРП в месяц"
//
// Formula: each side max(0.3 % × amount, 3 MRP), in dollars at fx.mjs; the
// KASE book on top when one is sourced; taxes from the tax map.
//
// KASE Global lines (AAPL_KZ, SPY_KZ ...) and depositary receipts trade on
// KASE itself, so they are "биржевой рынок" of the local market, not the
// "международный рынок" line (also 0,3 %, min 3 MRP, plus custodian fees).
//
// Cash: tenge and dollars (the account settles "в необходимой валюте", the
// broker converts USD, EUR, RUB, CNY on KASE for clients and has a foreign
// currency transfer order, Регламент annex 14). Every KASE line is in KZT
// or USD, so FX never goes into the total; a remark gives the 0.1 % (min
// 10,000 KZT) conversion when the cash is in the other currency.
//
// Book: KASE has no sourced book ("pas de touche simultanée",
// spreads/venues.mjs), so the total is N/A; the broker's fees are still
// computed.
//
// Left out: "Комиссия сторонних организаций" (KASE, the Central Securities
// Depository) is named next to every line with no figure, so nothing is
// added (as acro_cost.mjs); custody 3 MRP a month (a remark, it is real and
// sizeable); account opening or closing 2 MRP (once); securities transfers
// into or out of nominal holding (1-1.5 %, moving securities, not this
// order); off-exchange deals; the 100,000 MRP cap (never reached).
//
//   node brokers/udcapitaludcinve/udcapitaludcinve_cost.mjs KSPI XKAZ KZT --shares=10 --price=46000
//   node brokers/udcapitaludcinve/udcapitaludcinve_cost.mjs AAPL_KZ XKAZ USD --shares=4 --price=250
//   node brokers/udcapitaludcinve/udcapitaludcinve_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "udcapitaludcinve";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);

const SCHEDULE = {
  url: "https://udcapital.kz/downloads/files/brokerage-services/Tarify_na_BU_s_ND_21.08.2024.pdf",
  readOn: "2026-10-26",
  entity: 'AO "UD Capital" (KZ)',
};

const MRP = 4325; // KZT, 2026
const RATE = 0.003; // corporate securities, exchange market, each side
const MIN_KZT = 3 * MRP; // per order and side
const FX_RATE = 0.001; // USD-KZT on KASE
const FX_MIN_KZT = 10000;
const CUSTODY_KZT = 3 * MRP; // a month
const DEPOSITS = ["KZT", "USD"];

const KAZAKH = new Set(["XKAZ", "KAZAKHSTANSTOCKEXCHANGE", "KASE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const grouped = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const held = (ccy) => DEPOSITS.includes(code(ccy)) || depositHas(FOLDER, null, code(ccy));

const isKase = (row) => KAZAKH.has(code(row?.mic)) || KAZAKH.has(loose(row?.exchange));

/** One side's commission in dollars: 0.3 % of the amount, at least 3 MRP. */
export function sideUsd(notionalUsd) {
  const minUsd = dollars(MIN_KZT, "KZT");
  if (notionalUsd == null || minUsd == null) return null;
  return Math.max(notionalUsd * RATE, minUsd);
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace || loose(m.unsourced?.name) === wantPlace;
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
    cashCurrency: "KZT",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue UD Capital n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue UD Capital` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez UD Capital`,
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
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  if (!isKase(m.row)) return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le tarif` };

  const inCash = held(listing.currency);
  const custodyUsd = dollars(CUSTODY_KZT, "KZT");
  const remark = [
    String(m.row.remark || "").trim(),
    inCash ? fxRemark(FX_RATE * 100, listing.currency, `(min ${grouped(FX_MIN_KZT)} KZT)`) : "",
    `Custody ${grouped(CUSTODY_KZT)} KZT${custodyUsd != null ? ` (about ${Math.round(custodyUsd)} USD)` : ""} a month.`,
  ]
    .filter(Boolean)
    .join("\n");
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, r) => sum + r, 0);
  const shared = {
    ...answer,
    listing,
    remark,
    cashCurrency: inCash ? listing.currency : "KZT",
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `tarif UD Capital relu le ${SCHEDULE.readOn} : titres de sociétés sur le marché boursier 0,3 % de la transaction, ` +
      `au moins 3 MRP (${grouped(MIN_KZT)} KZT en 2026), à l'achat et à la vente ; frais de tiers (KASE, dépositaire central) ` +
      `nommés sans montant, laissés à 0 ; conversion USD-KZT 0,1 %, au moins 10 000 KZT`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), kzt: usdPer("KZT") },
    fxIfConverted: FX_RATE,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = sideUsd(notionalUsd);
  const minimum = side != null && notionalUsd * RATE < side;
  const commissionUsd = side == null ? null : side * 2;
  const brokerFees = commissionUsd;
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    minimum ? `minimum de 3 MRP appliqué à chaque sens` : `0,3 % au-dessus du minimum`,
    inCash
      ? `ligne en ${listing.currency}, devise de dépôt : change hors du chiffre`
      : `${listing.currency} n'est pas une devise de dépôt`,
    marketPerShare != null
      ? `carnet ${marketPerShare} la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de carnet pour ce ticker"}`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    commission: { rate: RATE, minKzt: MIN_KZT, buy: finite(side, 6), sell: finite(side, 6), eachWay: true, minimum, currency: "USD" },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      bourse: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          commission: "0.3% of the deal, min 3 MRP, each side (corporate securities, exchange market)",
          mrp: `${MRP} KZT (2026)`,
          fx: "USD-KZT on KASE 0.1%, min 10,000 KZT (remark only: cash KZT and USD)",
          custody: "3 MRP a month (remark)",
          deposits: DEPOSITS.join(", "),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error(`usage : node brokers/${FOLDER}/${FOLDER}_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]`);
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
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $   (${out.commission?.buy} $ par sens${out.commission?.minimum ? ", minimum" : ""})`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
