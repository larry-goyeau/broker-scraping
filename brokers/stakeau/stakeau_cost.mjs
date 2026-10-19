// What one round trip costs at Stake: buy n shares at price p, sell them
// back at once, in dollars. Stake AUS and Stake Wall St. Stake Black,
// Stake Accumulate, card funding and transfers stay out.
//
// Re-read 2026-10-15. The Financial Services Guide is version 8, dated
// 22 April 2026. The pricing PDF is older (4 April 2026) and still prints
// a SEC rate and a higher TAF. The later guide is the schedule.
//
//   https://hellostake.com/au/pricing
//   https://hellostake.com/au/legal/financial-services-guide
//
//   brokerage      3 per order up to 30 000, then 0.01% of the order.
//                  AUD on the ASX, USD on Wall St. Both legs.
//   FX             0.55% (minimum 2 USD) when cash moves between AUD and
//                  USD. It is funding, not this trip: a USD balance can
//                  sit at DriveWealth.
//   SEC            0 on a sell, in the April 2026 guide.
//   TAF            0.000166 USD a share sold, minimum 0.01, cap 8.30.
//                  One sell in the round trip.
//   ADR            0.01–0.03 USD a share a quarter. Custody, not this trip.
//
// ASX orders go to FinClear Execution Ltd. There is no free ASX book.
// US orders go to DriveWealth LLC. The equity 606 has no stock mix, so
// there is no Q and the book stays the quoted NBBO. An OTC line has no
// single tape.
//
//   node brokers/stake/stake_cost.mjs BHP ASX AUD --shares=10 --price=40
//   node brokers/stake/stake_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/stake/stake_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("stake-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://hellostake.com/au/pricing",
  fsg: "https://hellostake.com/au/legal/financial-services-guide",
  readOn: "2026-10-15",
  fsgOn: "2026-04-22",
  entity: "Stakeshop Pty Ltd",
  venue: "FinClear Execution Ltd on the ASX; DriveWealth LLC in the US",
  rule606: "drivewealth",
};

const FLAT = 3;
const FLAT_UP_TO = 30_000;
const RATE = 0.0001;
const TAF_PER_SHARE = 0.000166;
const TAF_MIN = 0.01;
const TAF_CAP = 8.3;
const FX_BPS = "0.55";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function leg(notional) {
  if (!(notional > 0)) return null;
  return notional >= FLAT_UP_TO ? notional * RATE : FLAT;
}

function taf(shares) {
  return Math.min(TAF_CAP, Math.max(TAF_MIN, TAF_PER_SHARE * shares));
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const want = place ? listingKey({ exchange: place, mic: place }) : {};
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function nmsLine(row) {
  return code(row.currency) === "USD" && loose(row.exchange) !== "OTC";
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the Stake ticket.
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
    cashCurrency: null,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Stake n'existe pas encore : lancer `node brokers/stake/stake_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Stake` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Stake`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "stake",
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
  const american = nmsLine(m.row);
  const q = american ? qOf("stake") : null;
  const leaf = book.leaf;
  let marketBp = bp ?? (american ? null : leaf?.bp ?? null);
  let marketPerShare = perShare ?? null;
  if (american && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: "stake", ticker: listing.ticker, fallback: leaf?.perShare ?? null });
    if (quoted != null) marketPerShare = quoted;
  } else if (!american && perShare == null) {
    marketPerShare = leaf?.perShare ?? null;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const feeCurrency = american ? "USD" : "AUD";
  const shared = {
    ...answer,
    cashCurrency: feeCurrency,
    listing,
    remark: american ? fxRemark(FX_BPS, "USD", "min 2 USD") : "",
    url: SCHEDULE.url,
    basis: `barème Stake, relu le ${SCHEDULE.readOn} : 3 ${feeCurrency} l'ordre jusqu'à 30 000, puis 0,01 %`,
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
  const one = leg(notional);
  const commissionUsd = one == null ? null : dollars(one * 2, feeCurrency);
  const tafUsd = american ? taf(n) : 0;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, tafUsd, taxUsd);
  const bookLine =
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? q != null
          ? `carnet 605 × Q DriveWealth, ${marketPerShare} $ la part`
          : `NBBO coté ${marketPerShare} $ la part : le 606 DriveWealth n'a pas de mix actions`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`;
  const confidence = [
    shared.basis,
    "hors Stake Black et hors Accumulate",
    american ? "SEC 0 sur la vente" : "ligne en AUD : pas de change",
    american ? `TAF ${TAF_PER_SHARE} USD la part vendue, minimum ${TAF_MIN}, plafond ${TAF_CAP}` : "pas de TAF",
    american ? "change 0,55 % (minimum 2 USD) à chaque virement, hors du nombre" : null,
    bookLine,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: { each: one, currency: feeCurrency, eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: american
            ? `pas de carnet 605 pour ${listing.ticker || etf}`
            : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
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
      réglementaire: american ? finite(tafUsd, 6) : 0,
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          brokerage: "3 up to 30000, then 0.01%, each way",
          asx: "AUD",
          wallSt: "USD",
          sec: "0",
          taf: `${TAF_PER_SHARE} USD a share sold, min ${TAF_MIN}, cap ${TAF_CAP}`,
          fx: "0.55% min 2 USD on an AUD/USD transfer",
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node brokers/stake/stake_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]",
    );
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

  const show = (value) => (value == null ? "N/A" : value);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const listing = out.listing;
  console.log(`${listing.ticker || listing.isin} — ${listing.name || ""}`);
  console.log(`${listing.exchange}${listing.mic ? ` (${listing.mic})` : ""}, ${listing.currency}, ${(listing.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const trade = out.trade;
    console.log(
      `${trade.shares} part${trade.shares > 1 ? "s" : ""} à ${trade.price} ${trade.currency} = ${trade.notional.toFixed(2)} ${trade.currency}\n`,
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const bill = out.parts || {};
    if (bill.marché != null) console.log(`  carnet         : ${bill.marché} $`);
    if (bill.courtage != null) console.log(`  courtage       : ${bill.courtage} $`);
    if (bill.réglementaire) console.log(`  réglementaire  : ${bill.réglementaire} $`);
    if (bill.taxes) console.log(`  taxes          : ${bill.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
