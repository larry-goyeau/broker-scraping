// What one round trip costs at Freestoxx (WH SelfInvest S.A., Luxembourg):
// buy n American shares at price p, sell them back at once, in dollars.
// The catalogue is NYSE, Nasdaq and NYSE American shares; no ETFs for EU
// retail. Options are not this trip.
//
// Read on 2026-10-18.
//   https://www.freestoxx.com/docs/freestoxx-freefutures-budget-en.pdf
//     (rate card, effective 1.7.2026)
//   https://www.freestoxx.com/docs/freestoxx-freefutures-ex-ante-fees-disclosure-en.pdf
//     (ex-ante costs and charges, V260701)
//
//   Commission     zero-commission model: 0.00 $ per order. This is the
//                  model priced. The mini-commission model (0.0035 $ a
//                  share, min 0.89 $) is a choice made at opening; remark.
//   Regulatory     "SEC fee and other: at cost". The disclosure prints:
//                    SEC   0.0000080 x principal, sell only
//                    TAF   0.000119 $ a share, max 5.95 $, sell only
//                    DTC   0.00015 $ a share, buy and sell
//                    CAT   0.000013 $ a share (the side is not stated;
//                          charged on both, as the CAT is)
//                  each rounded up to the next cent. The disclosure calls
//                  them indicative.
//   FX             the account is in dollars (deposits.mjs) and every line
//                  is in dollars, so no trade converts. A deposit in another
//                  currency pays the depositary bank's charge plus 0.3 % —
//                  funding, not this trip.
//   Taxes          none named for US shares.
//
// Orders go to Vision Financial Markets (best-execution page). Vision files
// its own 606 (CRD 142271) and spreads/rule606.mjs aliases freestoxx to it,
// so spreadLeaf gives the 605 figure times Vision's Q.
//   https://www.freestoxx.com/en/commission-free-trading/mifid-legal-communication/best-execution-policy
//
// Fixed fee 4.99 $ a month with the Free Services pack (5 $ quotes if no
// order in the month), Full Services 9.99 € a month. Custody free up to 50
// positions, then 0.70 $ a position a month. Outgoing transfer 50 $.
// Liquidation 25 $. None of that is this trip.
//
//   node brokers/freestoxx/freestoxx_cost.mjs AAPL XNAS USD --shares=10 --price=343
//   node brokers/freestoxx/freestoxx_cost.mjs F XNYS USD --shares=500 --price=12
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("freestoxx-parsed.json", import.meta.url);
const PAGE = "https://www.freestoxx.com/docs/freestoxx-freefutures-budget-en.pdf";
const DISCLOSURE = "https://www.freestoxx.com/docs/freestoxx-freefutures-ex-ante-fees-disclosure-en.pdf";
const READ_ON = "2026-10-18";
const CASH = "USD";
const COMMISSION = 0;
const SEC_RATE = 0.000008;
const TAF = { perShare: 0.000119, cap: 5.95 };
const DTC_PER_SHARE = 0.00015;
const CAT_PER_SHARE = 0.000013;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
// "Any decimals inferior to cents are rounded up to the next highest cent."
const up = (x) => (x > 0 ? Math.ceil(Number((x * 100).toPrecision(12))) / 100 : 0);

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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// The regulatory and clearing levies of one order, in dollars.
export function levies({ shares, notional, side }) {
  const sell = side === "sell";
  const sec = sell ? up(notional * SEC_RATE) : 0;
  const taf = sell ? up(Math.min(shares * TAF.perShare, TAF.cap)) : 0;
  const dtc = up(shares * DTC_PER_SHARE);
  const cat = up(shares * CAT_PER_SHARE);
  return { sec, taf, dtc, cat, total: sec + taf + dtc + cat };
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
    cashCurrency: CASH,
    url: PAGE,
    remark:
      "Flat fee $4.99 a month. Custody is free up to 50 positions, then $0.70 a position a month.",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Freestoxx n'existe pas encore : lancer `node brokers/freestoxx/freestoxx_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Freestoxx` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Freestoxx`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "freestoxx",
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
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => value,
  });
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `grille Freestoxx du 1.7.2026 et coûts ex ante V260701, relus le ${READ_ON} : modèle zéro commission, 0 $ par ordre, ` +
      `plus SEC 0,0000080 × montant et TAF 0,000119 $/action (max 5,95 $) à la vente, DTC 0,00015 $/action et CAT 0,000013 $/action par sens, chacun arrondi au cent supérieur`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${listing.ticker || etf} est coté en ${listing.currency} : Freestoxx ne vend que des actions en dollars` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const buy = levies({ shares: n, notional, side: "buy" });
  const sell = levies({ shares: n, notional, side: "sell" });
  const commissionUsd = COMMISSION * 2;
  const leviesUsd = buy.total + sell.total;
  const brokerFees = plus(commissionUsd, leviesUsd);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    commission: { each: COMMISSION, currency: CASH, eachWay: true, levies: { buy, sell } },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      bourse: finite(leviesUsd, 6),
      change: 0,
      taxes: 0,
    },
    confidence: [
      shared.basis,
      book.q != null
        ? `ordres transmis à Vision Financial Markets : carnet 605 × Q de Vision (${book.q.toFixed(3)})`
        : "ordres transmis à Vision Financial Markets, sans Q ce trimestre : NBBO coté",
      "CAT : le côté n'est pas écrit, compté à l'achat et à la vente",
      `coûts ex ante : ${DISCLOSURE}`,
    ].join(" ; "),
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
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
