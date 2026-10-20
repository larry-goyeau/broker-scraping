// What one round trip costs at Light Horse: buy n shares at price p, sell
// them back at once, in dollars. US-listed stocks, ETFs and ADRs. Options,
// margin and short selling stay out.
//
// Light Horse Securities Inc. (US), an introducing broker. Apex Clearing
// Corporation executes, clears and custodies (Form CRS). Pricing page
// re-read 2026-10-18 through its markdown twin. It prints no date of its
// own, only the dates the regulators' rates took effect.
//
//   https://www.lighthorse.io/pricing  (/pricing.md)
//   https://www.lighthorse.io/terms/form-crs  (/terms/form-crs.md)
//
//   commission      US stocks & ETFs $0
//   SEC             $20.60 per $1M of proceeds, on the sale (rate of
//                   4 April 2026)
//   TAF             $0.000195 a share on the sale, max $9.79 (rate of
//                   1 January 2026)
//
// The page names no rounding, so the levies are counted as computed. CAT
// is not on the page and is left out. Payment for order flow is named on
// the CRS: the order goes to Apex, which routes it.
//
// Left out because they do not ride on an order: wires ($8 / $14 in, $25 /
// $50 out), the $95 outbound ACAT, corporate-action fees. No maintenance or
// inactivity fee. A wire must be in US dollars or it is returned, so the
// account never converts.
//
// Light Horse files no 606 of its own: it adopts Apex's by reference (FINRA
// 606 bulk disclosures), and spreads/rule606.mjs aliases lighthorse to apex.
// Apex executes the order, so the book is Apex's Q times the 605.
//
//   node brokers/lighthorse/lighthorse_cost.mjs AAPL NASDAQ USD --shares=10 --price=343.46
//   node brokers/lighthorse/lighthorse_cost.mjs SPY NYSE USD --shares=100 --price=761.69
//   node brokers/lighthorse/lighthorse_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("lighthorse-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.lighthorse.io/pricing",
  crs: "https://www.lighthorse.io/terms/form-crs",
  readOn: "2026-10-18",
  secAsOf: "2026-04-04",
  tafAsOf: "2026-01-01",
  entity: "Light Horse Securities Inc.",
  clearing: "Apex Clearing Corporation",
  // Apex executes and clears: its 606 is the routing (alias in rule606.mjs).
  rule606: "lighthorse",
};

const COMMISSION = 0;
const SEC_RATE = 20.6 / 1e6;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const REMARK = "";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isOverTheCounter = (row) => /^(OTC|PINK|GREY)/i.test(String(row?.exchange || ""));
const isAdr = (row) => /\bADRs?\b|american deposit/i.test(String(row?.name || ""));

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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints; `brokerFees` is the commission alone.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "USD", remark: REMARK };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Light Horse n'existe pas encore : lancer `node brokers/lighthorse/lighthorse_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Light Horse` };
  if (!matches.length) {
    return { ...answer, why: `${etf} n'est pas coté sur cette place dans cette devise chez Light Horse`, alternatives: listAlternatives(named) };
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
  // Apex's Q times the blended 605. The fallback stays null: where the 605
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
    basis: `barème Light Horse, relu le ${SCHEDULE.readOn} : 0 $ de commission, SEC et TAF à la vente`,
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
  const sec = notionalUsd == null ? null : notionalUsd * SEC_RATE;
  const taf = Math.min(TAF_CAP, n * TAF_PER_SHARE);
  const commission = COMMISSION * 2;
  const usd = plus(bookUsd, commission, sec, taf);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commission, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source 605"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: { commission: COMMISSION },
    sell: { commission: COMMISSION, sec: finite(sec, 6), taf: finite(taf, 6), tafCapped: n * TAF_PER_SHARE > TAF_CAP },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(commission, 6),
      réglementaire: finite(plus(sec, taf), 6),
    },
    commission: { each: COMMISSION, currency: "USD", eachWay: true },
    cap: { part: "TAF", amount: TAF_CAP, per: "vente" },
    confidence: [
      `commission Light Horse 0 $ par sens, page tarifaire relue le ${SCHEDULE.readOn}`,
      `SEC 20,60 $ par million à la vente (taux du ${SCHEDULE.secAsOf}), TAF ${TAF_PER_SHARE} $ la part plafonnée à ${TAF_CAP} $ (taux du ${SCHEDULE.tafAsOf}) ; la page ne dit pas d'arrondi, donc au calcul`,
      marketPerShare != null
        ? q != null
          ? `carnet 605 × Q d'Apex (${q.toFixed(3)}) : ${marketPerShare} $ la part. Apex exécute et compense pour Light Horse (Form CRS)`
          : `NBBO coté ${marketPerShare} $ la part : pas de Q pour Apex ce trimestre`
        : marketBp != null
          ? `carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`
          : `aucun carnet : ${m.unsourced?.name || listing.exchange}, ${m.unsourced?.why || "pas de source"}`,
      `hors total : CAT (absente de la page), virements, ACAT sortant 95 $${listing.adr ? ", frais de garde ADR (non chiffrés sur la page)" : ""}. Compte en dollars, un virement dans une autre devise est renvoyé`,
    ].join(" ; "),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, commission: COMMISSION, sec: SEC_RATE, taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP }, q: qOf(SCHEDULE.rule606) }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/lighthorse/lighthorse_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
    if (out.alternatives?.length) console.log(`\nce que Light Horse propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
