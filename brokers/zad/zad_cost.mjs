// What one round trip costs at Zad: buy n shares at price p, sell them back
// at once, in dollars. US stocks and ETFs in the trading account. Options
// ($5 a contract) and the Robo Zad account (1% a year) stay out.
//
// Zad is The Securities House's app (Kuwait, CMA-licensed). Its US orders go
// through Alpaca's Broker API: "brokerage, custody, and post-trade" (Alpaca's
// launch post of 9 March 2023). FAQ re-read 2026-10-18; it prints no date.
//
//   https://www.joinzad.com/en/faq/
//   https://alpaca.markets/blog/securities-house-launches-zad-app-kuwaits-first-shariah-compliant-investment-platform-with-alpaca/
//
//   commission      "The commission for buy and sell transactions is $3 or
//                   0.0015, whichever is higher." Each side, to the cent.
//                   One rate for stocks, ETFs and fractions.
//
// No SEC fee, TAF or CAT is named anywhere on Zad's pages. Alpaca bills
// those to the firm it serves; whether Zad passes them on is not said, so
// they stay out of the number rather than being borrowed from Alpaca's own
// retail card.
//
// FX: the trading account holds dollars ($3 of cash must stay in it, both
// withdrawal routes are counted in dollars). A K-Net, card or local transfer
// is in dinars and is converted on the way in. That is the deposit, not the
// trade, and no rate or spread is printed for it, so it is a remark.
//
// Left out because they do not ride on an order: the 35 KWD minimum
// deposit, the $50 bank fee on an international withdrawal (local
// withdrawal free, $100 minimum on both).
//
// Zad files no 606; spreads/rule606.mjs aliases zad to Alpaca Securities LLC,
// so the book is Alpaca's Q times the 605.
//
//   node brokers/zad/zad_cost.mjs AAPL NASDAQ USD --shares=10 --price=343.46
//   node brokers/zad/zad_cost.mjs SPUS NYSEARCA USD --shares=50 --price=50
//   node brokers/zad/zad_cost.mjs AAPL NASDAQ USD --shares=0.1 --price=343.46
//   node brokers/zad/zad_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";

const CATALOGUE = new URL("zad-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.joinzad.com/en/faq/",
  broker: "https://alpaca.markets/blog/securities-house-launches-zad-app-kuwaits-first-shariah-compliant-investment-platform-with-alpaca/",
  readOn: "2026-10-18",
  entity: "The Securities House K.S.C.P. (Zad)",
  // Orders go through Alpaca's Broker API: Alpaca Securities' 606 (alias in rule606.mjs).
  rule606: "zad",
};

const MIN_FEE = 3;
const RATE = 0.0015;
const CASH_FLOOR = 3;
// The account holds dollars; a dinar deposit converts at an unpublished rate.
const REMARK = fxRemark("", "USD");

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isOverTheCounter = (row) => /^(OTC|PINK|GREY)/i.test(String(row?.exchange || ""));
const isAdr = (row) => /\bADRs?\b|american deposit/i.test(String(row?.name || ""));
const cents = (x) => Math.round(x * 100) / 100;

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue || null : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "USD").toUpperCase() === wantCurrency);
  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

// One side: $3 or 0.15 % of the amount, whichever is higher, to the cent.
const side = (notionalUsd) => cents(Math.max(MIN_FEE, notionalUsd * RATE));

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints; `brokerFees` is Zad's commission.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "USD", remark: REMARK };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Zad n'existe pas encore : lancer `node brokers/zad/zad_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Zad` };
  if (!matches.length) {
    return { ...answer, why: `${etf} n'est pas coté sur cette place dans cette devise chez Zad`, alternatives: listAlternatives(named) };
  }

  const m = matches[0];
  const otc = isOverTheCounter(m.row);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency || "USD",
    unsourced: m.unsourced,
    broker: SCHEDULE.rule606,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    otc,
    adr: isAdr(m.row),
  };
  // Alpaca's Q times the blended 605. The fallback stays null: where the 605
  // has no row, the leaf below already carries the same Q once.
  const quoted = otc ? null : usBookPerShare({ broker: SCHEDULE.rule606, ticker: listing.ticker, fallback: null });
  const marketPerShare = perShare ?? quoted ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare == null ? book.leaf?.bp ?? null : null);
  const q = qOf(SCHEDULE.rule606);

  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    url: SCHEDULE.source,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    basis: `FAQ Zad relue le ${SCHEDULE.readOn} : ${MIN_FEE} $ ou 0,15 % l'ordre, le plus élevé, à l'achat et à la vente`,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const bookUsd =
    marketPerShare != null ? marketPerShare * n : marketBp != null && notionalUsd != null ? (notionalUsd * marketBp) / 1e4 : null;
  const each = notionalUsd == null ? null : side(notionalUsd);
  const commission = each == null ? null : each * 2;
  const usd = plus(bookUsd, commission);
  const floorBites = notionalUsd != null && notionalUsd * RATE < MIN_FEE;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commission, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source 605"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: { commission: finite(each, 6) },
    sell: { commission: finite(each, 6) },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(commission, 6),
    },
    commission: { each: RATE, min: MIN_FEE, currency: "USD", eachWay: true },
    confidence: [
      `commission Zad ${MIN_FEE} $ ou 0,15 % par ordre, le plus élevé, FAQ relue le ${SCHEDULE.readOn}` +
        (floorBites ? ` : le plancher de ${MIN_FEE} $ mord sous ${MIN_FEE / RATE} $ d'ordre` : ` : 0,15 % de ${Number(notionalUsd.toFixed(2))} $ = ${each} $`),
      `ni SEC, ni TAF, ni CAT : Zad n'en nomme aucun, et Alpaca les facture à la firme sans que Zad dise les refacturer`,
      marketPerShare != null
        ? q != null
          ? `carnet 605 × Q d'Alpaca (${q.toFixed(3)}) : ${marketPerShare} $ la part. Zad passe par l'API Broker d'Alpaca`
          : `NBBO coté ${marketPerShare} $ la part : pas de Q pour Alpaca ce trimestre`
        : marketBp != null
          ? `carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`
          : `aucun carnet : ${m.unsourced?.name || listing.exchange}, ${m.unsourced?.why || "pas de source"}`,
      `hors total : conversion KWD → USD au dépôt (K-Net, carte, virement local), sans taux publié, retrait international 50 $, ${CASH_FLOOR} $ de cash à garder pour vendre${listing.adr ? ", frais de garde ADR (non chiffrés)" : ""}`,
    ].join(" ; "),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, commission: { rate: RATE, min: MIN_FEE, eachWay: true }, sec: null, taf: null, fx: "KWD deposit converted, rate not published", q: qOf(SCHEDULE.rule606) }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/zad/zad_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }
  const l = out.listing;
  if (!l) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(`\nce que Zad propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  for (const [name, v] of Object.entries(out.parts || {})) if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
  console.log(`\n  ${out.basis}`);
  for (const line of String(out.confidence || "").split(" ; ")) if (line) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
}
