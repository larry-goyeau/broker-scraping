// What one round trip costs at Moneybox: buy n shares at price p, sell them
// back at once, in dollars. Digital Moneybox Limited, UK: the Stocks &
// Shares ISA, Lifetime ISA, Junior ISA and General Investment Account.
// The pension has its own table and stays out.
//
// Fees & Charges, section 3 (investing products), read on 2026-10-21 from
// the Wayback capture of 13 July 2026 (the live page sits behind a
// Cloudflare wall):
//   https://support.moneyboxapp.com/fees-and-charges
//   commission     0: "We do not, for example, charge a fixed fee or
//                  commission on each individual buy or sell order."
//   subscription   £1 a month per account from month 4, waived under £5
//                  invested or with £5,000 in a Moneybox cash product.
//                  Not a trade fee: remark.
//   platform fee   0.45% a year of the investments, charged monthly.
//                  A real holding cost: remark.
//   FX             0.45%, US stocks only: of the sterling value of the
//                  order on a buy, of the sterling proceeds on a sale.
//                  The account holds pounds only (deposits.mjs), so a US
//                  line converts on the way in and on the way out: twice,
//                  in the total.
//   SEC / FINRA    "may be passed on to our customers", no amount printed:
//                  0, as in the other cost files.
//
// Order Transmission Policy v2025.1, read on 2026-10-21 from the Wayback
// capture of 3 October 2026:
//   https://support.moneyboxapp.com/order-transmission-policy/
//   ETFs go to Winterflood, which sends exchange-traded funds to a retail
//   service provider: the book is London's. US stock orders go to the US
//   broker-dealer DriveWealth, the only one named, so a US line takes
//   DriveWealth's Rule 606 Q on the 605 (spreads/rule606.mjs).
//
// Stamp and transaction taxes come from taxMap, on the buy. The ETFs are
// Irish and the shares American: none applies.
//
// In the total: the book, FX on US lines, and any tax. Remark: the
// platform fee and the subscription.
//
//   node brokers/moneybox/moneybox_cost.mjs VUAG XLON GBP --shares=10 --price=100
//   node brokers/moneybox/moneybox_cost.mjs INRG XLON GBX --shares=100 --price=650
//   node brokers/moneybox/moneybox_cost.mjs AAPL XNAS USD --shares=1 --price=230
//   node brokers/moneybox/moneybox_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("moneybox-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://support.moneyboxapp.com/fees-and-charges",
  policy: "https://support.moneyboxapp.com/order-transmission-policy/",
  readOn: "2026-10-21",
  feesCapture: "2026-07-13",
  policyCapture: "2026-10-03",
  entity: "Digital Moneybox Limited",
  venue: "Winterflood (ETF, Londres) ; DriveWealth LLC (actions US)",
  rule606: "drivewealth",
};

const BASE = "GBP";
const FX_ONE_WAY = 0.0045;
const US_DEALER = SCHEDULE.rule606;
const REMARK = "Platform fee is 0.45% a year, plus £1 a month.";

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
  return code(row.currency) === "USD" && (code(row.mic) === "XNAS" || code(row.mic) === "XNYS");
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the FX on a US line,
 * the commission being 0.
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
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Moneybox n'existe pas encore : lancer `node brokers/moneybox/moneybox_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Moneybox` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Moneybox`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const american = nmsLine(m.row);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: american ? US_DEALER : "moneybox",
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
  const q = american ? qOf(US_DEALER) : null;
  const leaf = book.leaf;
  let marketBp = bp ?? (american ? null : leaf?.bp ?? null);
  let marketPerShare = perShare ?? null;
  if (american && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: US_DEALER, ticker: listing.ticker, fallback: leaf?.perShare ?? null });
    if (quoted != null) marketPerShare = quoted;
  } else if (!american && perShare == null) {
    marketPerShare = leaf?.perShare ?? null;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const cash = listingCash(listing.currency);
  const held = depositHas("moneybox", null, cash);
  const shared = {
    ...answer,
    cashCurrency: held ? cash : BASE,
    listing,
    url: SCHEDULE.url,
    basis:
      `barème Moneybox (Fees & Charges, capture du ${SCHEDULE.feesCapture}, relu le ${SCHEDULE.readOn}) : aucune commission par ordre` +
      (held ? "" : ` ; change forcé GBP ↔ ${cash} : 0,45 % de la valeur en livres, à l'achat et à la vente`),
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  // Forced conversion: pounds into dollars on the buy, back to pounds on the sale.
  const fxUsd = held ? 0 : notionalUsd == null ? null : notionalUsd * FX_ONE_WAY * 2;
  const brokerFees = plus(0, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const bookLine =
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? q != null
          ? `carnet 605 × Q DriveWealth, ${marketPerShare} $ la part`
          : `NBBO coté ${marketPerShare} $ la part : pas de Q DriveWealth`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`;
  const confidence = [
    shared.basis,
    american ? "ordre transmis à DriveWealth LLC ; SEC et FINRA non chiffrés par Moneybox : 0" : "ordre transmis à Winterflood, exécuté à Londres",
    held ? "ligne en livres : pas de change" : "change 0,45 % × 2, dans le total : dépôt en GBP seulement",
    "frais de plateforme 0,45 %/an et abonnement 1 £/mois en remarque",
    bookLine,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { rate: 0, min: 0, flat: 0, currency: BASE, eachWay: true },
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
      courtage: 0,
      change: finite(fxUsd, 6),
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
          commission: "0",
          fx: "0.45% of the sterling value, US stocks only, buy and sell",
          platform: "0.45% a year",
          subscription: "£1 a month from month 4",
          sec: "0 (not printed)",
          cash: BASE,
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
    console.error("usage : node brokers/moneybox/moneybox_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (bill.change) console.log(`  change         : ${bill.change} $`);
    if (bill.taxes) console.log(`  taxes          : ${bill.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
