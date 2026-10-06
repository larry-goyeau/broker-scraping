// What one round trip costs at Matsui Securities: buy n shares at price p,
// sell them back at once, in dollars. Internet orders. The phone line is
// another schedule and stays out. The under-26 waiver and the NISA account
// are other offers. Prior turnover is unknown, so the day is this trip only.
//
// Re-read 2026-09-27.
//
//   Japan, cash, box rate on the day's executions, age 26 and over
//     up to 500 000 ¥            0
//     up to 1 000 000 ¥          1 100 ¥ including tax
//     up to 2 000 000 ¥          2 200 ¥ including tax
//     each further 1 000 000 ¥   plus 1 100 ¥ including tax
//     above 100 000 000 ¥        110 000 ¥ including tax, the cap
//     one amount for the day, not one amount per order
//   United States, one order
//     0.495 % including tax
//     0 under a notional of 2.22 USD
//     capped at 22 USD including tax
//
// Converting yen and dollars is published at 0. Settling the US order in
// yen is another choice and costs 0.25 ¥ per dollar inside the rate. That
// stays out of this ticket. Odd-lot sales, the best-match improvement fee
// and the tax-loss service are other orders. Custody is not a ticket.
// These rows have no ISIN, so the tax map adds nothing. The tariff names
// no SEC fee.
//
// US orders go to Interactive Brokers LLC. That firm files a Rule 606, so
// a US line uses that mix. A Japanese line has no book.
//
//   https://www.matsui.co.jp/stock/domestic/fee/
//   https://www.matsui.co.jp/us-stock/domestic/fee/
//   https://www.matsui.co.jp/us-stock/domestic/rule/
//
//   node brokers/matsui/matsui_cost.mjs 1301 Tokyo JPY --shares=10 --price=3000
//   node brokers/matsui/matsui_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/matsui/matsui_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("matsui-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.matsui.co.jp/stock/domestic/fee/",
  us: "https://www.matsui.co.jp/us-stock/domestic/fee/",
  rules: "https://www.matsui.co.jp/us-stock/domestic/rule/",
  readOn: "2026-09-27",
  entity: "松井証券",
  venue: "Interactive Brokers LLC",
};

const BOX_FREE = 500_000;
const BOX_STEP = 1_000_000;
const BOX_SECOND = 1_100;
const BOX_THIRD = 2_200;
const BOX_ADD = 1_100;
const BOX_CAP = 110_000;
const US_RATE = 0.00495;
const US_FREE = 2.22;
const US_CAP = 22;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const JAPAN = new Set(["TOKYO", "NAGOYA", "FUKUOKA", "SAPPORO"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function boxYen(daily) {
  if (!(daily > 0)) return null;
  if (daily <= BOX_FREE) return 0;
  if (daily <= BOX_STEP) return BOX_SECOND;
  if (daily <= 2 * BOX_STEP) return BOX_THIRD;
  const extra = Math.ceil((daily - 2 * BOX_STEP) / BOX_STEP);
  return Math.min(BOX_CAP, BOX_THIRD + BOX_ADD * extra);
}

function usLeg(notional) {
  if (!(notional > 0)) return null;
  if (notional <= US_FREE) return 0;
  return Math.min(notional * US_RATE, US_CAP);
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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
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
    cashCurrency: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Matsui n'existe pas encore : lancer `node brokers/matsui/matsui_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Matsui` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Matsui`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "matsui",
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
  const market = loose(listing.brokerExchange);
  const japan = JAPAN.has(market);
  const american = US_MICS.has(market) && listing.currency === "USD";
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: japan ? "JPY" : "USD",
    remark: "",
    url: japan ? SCHEDULE.url : SCHEDULE.us,
    basis: japan
      ? `barème boîte Matsui, relu le ${SCHEDULE.readOn} : 0 ¥ jusqu'à 500 000 ¥ dans la journée, un seul total pour l'aller-retour`
      : `barème US Matsui, relu le ${SCHEDULE.readOn} : 0,495 % TTC par ordre, plafond 22 USD`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "matsui", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const commissionLocal = japan ? boxYen(notional * 2) : plus(usLeg(notional), usLeg(notional));
  const commissionUsd = commissionLocal == null ? null : japan ? dollars(commissionLocal, "JPY") : commissionLocal;
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    japan ? "marché japonais, 26 ans et plus, aucun autre ordre dans la journée" : `exécution ${SCHEDULE.venue}`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet 605 × Q IBKR, ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: japan
      ? { daily: commissionLocal, currency: "JPY", eachWay: false }
      : { rate: US_RATE, cap: US_CAP, currency: "USD", eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
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
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          japan: "0 up to 500000 JPY a day, then 1100 / 2200 JPY tax included, plus 1100 per further 1000000, cap 110000",
          us: "0.495 % tax included per order, 0 at 2.22 USD or below, cap 22 USD",
          conversion: "0 for JPY/USD exchange; 0.25 JPY per USD stays out when the order is settled in yen",
          rule606: "interactivebrokers",
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/matsui/matsui_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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

  const show = (x) => (x == null ? "N/A" : x);
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
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
