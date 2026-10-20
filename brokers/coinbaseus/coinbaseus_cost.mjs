// What one round trip costs at Coinbase: buy n US shares or ETF units at
// price p, sell them back at once, in dollars. Crypto is another book and
// stays out; so do the UK stock offer and its GBP conversion.
//
// Coinbase Capital Markets Corp (CCM), member FINRA/SIPC. "Execution,
// clearing and custody of all securities are provided by Apex Clearing
// Corporation." Stocks page and CCM fee schedule re-read 2026-10-18.
//
//   https://www.coinbase.com/stocks
//   https://images.ctfassets.net/o10es7wu5gm1/15gaaAIKknqZUL2LQVQ5sN/7b369aefcc0bb423fb88cd7c258119b3/CCM_Fee_Schedule.pdf
//     (titled "CCM Fee Schedule [12 17 2025]")
//
//   commission      $0 for self-directed individual cash accounts
//   SEC             $0 on the schedule
//   TAF             the schedule prints $0.000195 a share on equity sells,
//                   max $9.79, from 1 January 2026 — and its footnote 2 says
//                   "You will not be responsible for the payment of these
//                   fees". The stocks page FAQ says the same today: "We do
//                   not currently charge regulatory fees."
//   CAT             $0
//
// So no levy is in the number: the FAQ and the footnote both say the client
// does not pay them, and the TAF line is read as what CCM itself is billed.
// If CCM starts passing them on, the FAQ promises notice ahead of time.
//
// Left out because it does not ride on an order: the $75 outgoing ACATS.
// Stocks are bought with settled USD only; USDC sits in the Coinbase Inc.
// crypto account and is not this cash. No conversion.
//
// CCM files no 606 of its own: it adopts Apex's by reference (FINRA 606
// bulk disclosures), and spreads/rule606.mjs aliases coinbase to apex. Apex
// executes the order, so the book is Apex's Q times the 605.
//
//   node brokers/coinbaseus/coinbaseus_cost.mjs AAPL NASDAQ USD --shares=10 --price=343.46
//   node brokers/coinbaseus/coinbaseus_cost.mjs SPY NYSEARCA USD --shares=100 --price=761.69
//   node brokers/coinbaseus/coinbaseus_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("coinbaseus-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://images.ctfassets.net/o10es7wu5gm1/15gaaAIKknqZUL2LQVQ5sN/7b369aefcc0bb423fb88cd7c258119b3/CCM_Fee_Schedule.pdf",
  page: "https://www.coinbase.com/stocks",
  printed: "2025-12-17",
  readOn: "2026-10-18",
  entity: "Coinbase Capital Markets Corp",
  clearing: "Apex Clearing Corporation",
  // Apex executes, clears and custodies: its 606 is the routing (alias in rule606.mjs).
  rule606: "coinbaseus",
};

const COMMISSION = 0;
// Printed on the schedule, billed to CCM, not to the client (footnote 2).
const TAF_PRINTED = { perShare: 0.000195, cap: 9.79, charged: false };
const ACATS_OUT = 75;
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
    return { ...answer, why: "le catalogue Coinbase n'existe pas encore : lancer `node brokers/coinbaseus/coinbaseus_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Coinbase` };
  if (!matches.length) {
    return { ...answer, why: `${etf} n'est pas coté sur cette place dans cette devise chez Coinbase`, alternatives: listAlternatives(named) };
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
    url: SCHEDULE.page,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    basis: `barème CCM du ${SCHEDULE.printed} et FAQ de la page actions, relus le ${SCHEDULE.readOn} : 0 $ de commission, aucun frais réglementaire facturé`,
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
  const commission = COMMISSION * 2;
  const usd = plus(bookUsd, commission);
  const tafIfCharged = Math.min(TAF_PRINTED.cap, n * TAF_PRINTED.perShare);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commission, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source 605"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: { commission: COMMISSION },
    sell: { commission: COMMISSION, sec: 0, taf: 0, cat: 0 },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(commission, 6),
      réglementaire: 0,
    },
    commission: { each: COMMISSION, currency: "USD", eachWay: true },
    confidence: [
      `commission CCM 0 $ par sens (compte cash individuel, ordre passé soi-même), barème du ${SCHEDULE.printed} relu le ${SCHEDULE.readOn}`,
      `aucun frais réglementaire : la FAQ dit « We do not currently charge regulatory fees » et la note 2 du barème dit que le client ne les paie pas. ` +
        `La TAF imprimée (${TAF_PRINTED.perShare} $ la part, plafond ${TAF_PRINTED.cap} $) vaudrait ${Number(tafIfCharged.toPrecision(3))} $ ici si elle était refacturée`,
      marketPerShare != null
        ? q != null
          ? `carnet 605 × Q d'Apex (${q.toFixed(3)}) : ${marketPerShare} $ la part. Apex exécute, compense et conserve pour CCM`
          : `NBBO coté ${marketPerShare} $ la part : pas de Q pour Apex ce trimestre`
        : marketBp != null
          ? `carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`
          : `aucun carnet : ${m.unsourced?.name || listing.exchange}, ${m.unsourced?.why || "pas de source"}`,
      `hors total : ACATS sortant ${ACATS_OUT} $${listing.adr ? ", frais de garde ADR (non chiffrés)" : ""}. Achat en USD réglés seulement, aucune conversion`,
    ].join(" ; "),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, commission: COMMISSION, sec: 0, taf: TAF_PRINTED, cat: 0, acatsOut: ACATS_OUT, q: qOf(SCHEDULE.rule606) }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/coinbaseus/coinbaseus_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
    if (out.alternatives?.length) console.log(`\nce que Coinbase propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
