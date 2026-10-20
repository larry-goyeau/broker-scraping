// What one round trip costs at Deltastock: buy n shares at price p, sell
// them back at once, real stocks and ETFs in Delta Trading, in dollars.
// CFDs (the other tariff, Tarifa-Deltastock.pdf) are not this trip.
//
// Tariff for brokerage services, consolidated version, read 2026-10-18
// (adopted 26 January 2026, amended 1 September and 29 September 2026; the
// 29 September text applies from 29 September 2026 to new agreements and
// from 29 October 2026 to older ones).
//
//   Art. 4   commission for a deal with financial instruments
//              until 31.12.2026 inclusive   no commission
//              after 31.12.2026             0.02 USD per item, each deal
//            The free months are an offer that ends: the trip always pays
//            0.02 $ a share on the buy and again on the sale.
//   Art. 5   safekeeping 0.0025 % of the holdings' value a month, outbound
//            transfer 15 EUR a line, inbound free: not this order, remark.
//   Art. 6   the MTF's and the depository's ad hoc costs (W-8BEN, corporate
//            events) "cannot be specified and costed in advance": out.
//   Art. 7-8 cash withdrawal 0.40 %, bank transfers at the bank's cost
//            (min 1 EUR): funding, not this order.
//
// Cash: the account holds EUR and USD sub-accounts (deposits.mjs). A dollar
// line settles from the USD sub-account. Moving euros across is done at
// Deltastock's own EUR/USD quote, and the costs-and-charges information
// (version of 14.10.2026) says no fee or commission is charged on that
// revaluation and no other exchange cost: nothing enters the number, and
// the remark says the conversion is 0%.
//
// Venue and book. The order execution policy (stocks) says Deltastock does
// not execute: it transmits every order to the one execution venue, the MTF
// operated by International Trading System Ltd. (ITS Ltd.) in the Astana
// International Financial Centre, which clears it and whose ITS CSD Ltd.
// holds the shares. ITS describes itself as a pre-market for the US
// exchanges, routing by SOR to several liquidity pools with quotes "similar
// to those of the primary listing exchanges". Deltastock names no US
// broker-dealer and files no 606, so no Rule 606 mix is applied
// (spreads/rule606.mjs has no alias for it): the book is the quoted NBBO of
// the name, as the README says for a broker with no 606. The SEC Section 31
// fee and the FINRA TAF are not in the tariff and the fill is not on a US
// tape, so neither is added. A line the shared lists file only as "US" keeps
// that tape when a 605 row exists, otherwise its book is missing.
//
//   https://www.deltastock.com/legal-docs/Stocks/Tariff.pdf
//   https://www.deltastock.com/legal-docs/Stocks/Order_Execution_Policy.pdf
//   https://www.deltastock.com/legal-docs/Stocks/14102026/Information_regarding_the_costs_and_charges.pdf
//   https://www.deltastock.com/english/investments/trading-conditions.asp
//
//   node brokers/deltastock/deltastock_cost.mjs AAPL NASDAQ USD --shares=10 --price=343.46
//   node brokers/deltastock/deltastock_cost.mjs SPY "NYSE Arca" USD --shares=10 --price=600
//   node brokers/deltastock/deltastock_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("deltastock-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.deltastock.com/legal-docs/Stocks/Tariff.pdf",
  policy: "https://www.deltastock.com/legal-docs/Stocks/Order_Execution_Policy.pdf",
  costs: "https://www.deltastock.com/legal-docs/Stocks/14102026/Information_regarding_the_costs_and_charges.pdf",
  readOn: "2026-10-18",
  amended: "2026-09-29",
  entity: "Deltastock AD",
  venue: "MTF of International Trading System Ltd. (AIFC)",
};

// Art. 4: free through 31.12.2026, then 0.02 USD an item.
const FREE_UNTIL = "2026-12-31";
const PER_SHARE_AFTER = 0.02;
const CASH = "USD";
// Euros moved to the USD sub-account: no fee, no commission (costs and charges, 14.10.2026).
const FX_REMARK = "FX 0% when cash ≠ USD.";
const CUSTODY_MONTHLY = 0.000025;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const today = () => new Date().toISOString().slice(0, 10);

// One side, in dollars a share, on the day the trip is priced.
export function commissionPerShare(on = today()) {
  return on <= FREE_UNTIL ? 0 : PER_SHARE_AFTER;
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the Deltastock ticket.
 */
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
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Deltastock n'existe pas encore : lancer `node brokers/deltastock/deltastock_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Deltastock (actions réelles)` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Deltastock`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "deltastock",
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
  if (listing.currency !== CASH) {
    return { ...answer, listing, why: `${listing.currency} n'est pas une ligne du tarif actions réelles (dollars seulement)` };
  }

  const each = PER_SHARE_AFTER;
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    remark:
      `Safekeeping is ${(CUSTODY_MONTHLY * 100).toFixed(4)}% of the holdings a month.\n` + FX_REMARK,
    url: SCHEDULE.url,
    basis:
      `tarif courtage Deltastock (actions réelles), relu le ${SCHEDULE.readOn} : ` +
      `${PER_SHARE_AFTER} $ la part par opération (aucune commission jusqu'au ${FREE_UNTIL} inclus, offre non comptée)`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const commissionUsd = each * n * 2;
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    `ordre transmis au seul lieu d'exécution, ${SCHEDULE.venue} (politique d'exécution actions)`,
    "compte en USD : pas de change ; la conversion EUR/USD n'a ni frais ni commission (information coûts et frais du 14.10.2026)",
    marketPerShare != null
      ? `carnet NBBO coté ${marketPerShare} $ la part : Deltastock ne nomme aucun broker-dealer américain, pas de 606`
      : marketBp != null
        ? `carnet ${Number(marketBp.toPrecision(4))} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    "hors total : SEC et TAF (ni au tarif, ni sur une bande américaine), garde mensuelle, retraits",
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { perShare: each, currency: CASH, eachWay: true, freeUntil: FREE_UNTIL, after: PER_SHARE_AFTER },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de ligne 605 ni de NBBO pour ce symbole"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

function calledDirectly() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (calledDirectly()) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          commission: `0 until ${FREE_UNTIL}, then ${PER_SHARE_AFTER} USD a share each deal`,
          today: commissionPerShare(),
          custodyMonthly: CUSTODY_MONTHLY,
          fx: "none charged (EUR/USD at Deltastock's quote)",
          rule606: null,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/deltastock/deltastock_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  for (const [name, value] of Object.entries(out.parts || {})) {
    if (value != null) console.log(`  ${name.padEnd(15)}: ${value} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
