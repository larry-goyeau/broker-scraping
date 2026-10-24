// What one round trip costs at Netwealth Share Trading (run by Australian
// Investment Exchange Limited, AUSIEX, AFSL 241400): buy n shares at price p
// on the ASX or Cboe Australia, sell them back at once, internet order,
// Standard account, in dollars.
//
// Fees & Charges page and the Support Hub "Standard and Premium Accounts"
// article, read 2026-10-24. Internet originated, Equities and Warrants, per
// trade (each buy, each sell):
//   Standard   $17.99 up to $5,001
//              $19.95 from $5,001 up to $10,001
//              $26.99 from $10,001 up to $25,001
//              0.11 % above $25,001
//   Premium    $23.50 up to $10,001
//              $31.99 from $10,001 up to $25,001
//              0.13 % above $25,001
// Standard and Premium are not subscriptions: "Netwealth offers two types of
// account structures", "Both are free", "All Netwealth Trading Accounts are
// set to Standard", and Premium, on application, adds a $25,000 trading
// limit paid by direct debit at T+2 ("Premium accounts have higher brokerage
// rates"). So the row is the Standard account and the Premium brokerage is a
// remark at the order's value ("Premium account is x% more.").
// The figures are GST-inclusive: the page marks only the ETO contract fee
// "(exc. GST)". No exchange, clearing or settlement line is printed for a
// share trade; Australia has no stamp duty on listed shares (the Australian
// Shares page: "you pay no stamp duty"). Phone orders ($49.98 / 0.50 %),
// the $1.65 postage of a paper confirmation, IRESS ViewPoint ($77 a month
// under 15 trades) and the other administrative fees are not this order.
// ETFs pay the same brokerage (Support Hub, ETFs: "the same brokerage rates
// applying", ASX and Cboe Australia).
//
// Cash is AUD (deposits.mjs), every line is in AUD: no FX.
// Book: the venue's own book, ASX (XASX) or Cboe Australia (CHIA), through
// spreadLeaf, broker "netwealth". AUSIEX routes to ASX TradeMatch, ASX
// Centre Point or Cboe Australia at its discretion (Best Execution Policy);
// each row keeps the book of its own place.
//
//   https://www.sharetrading.netwealth.com.au/Public/FeesAndCharges/FeesAndCharges.aspx
//   https://www.sharetrading.netwealth.com.au/Public/ContactAndSupport/SupportHub/SupportHub.aspx?id=StandardAndPremiumAccounts
//
//   node brokers/netwealth/netwealth_cost.mjs BHP ASX AUD --shares=100 --price=45
//   node brokers/netwealth/netwealth_cost.mjs BHP "Cboe Australia" AUD --shares=1000 --price=45
//   node brokers/netwealth/netwealth_cost.mjs VAS ASX AUD --shares=10 --price=100
//   node brokers/netwealth/netwealth_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("netwealth-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.sharetrading.netwealth.com.au/Public/FeesAndCharges/FeesAndCharges.aspx",
  accounts: "https://www.sharetrading.netwealth.com.au/Public/ContactAndSupport/SupportHub/SupportHub.aspx?id=StandardAndPremiumAccounts",
  readOn: "2026-10-24",
  entity: "Australian Investment Exchange Limited (AUSIEX), Netwealth Share Trading",
  channel: "internet originated, Equities and Warrants",
  venue: "ASX TradeMatch, ASX Centre Point or Cboe Australia, at AUSIEX's discretion",
};

const CASH = "AUD";
// Per trade, each side, GST included. [upper bound of the order value, fee]
// then a rate above the last bound.
const TABLES = {
  standard: { steps: [[5001, 17.99], [10001, 19.95], [25001, 26.99]], rate: 0.0011 },
  premium: { steps: [[10001, 23.5], [25001, 31.99]], rate: 0.0013 },
};

function brokerage(table, value) {
  for (const [upTo, fee] of table.steps) if (value <= upTo) return fee;
  return value * table.rate;
}

const pct = (x) => Number(x.toFixed(x >= 1 ? 1 : 2));

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

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
    cashCurrency: CASH,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Netwealth n'existe pas encore : lancer `node brokers/netwealth/netwealth_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Netwealth` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Netwealth`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "netwealth",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    remark: "",
    url: SCHEDULE.url,
    basis: `barème Netwealth Share Trading, compte Standard, ordre internet, relu le ${SCHEDULE.readOn} : 17,99 AUD jusqu'à 5 001, 19,95 jusqu'à 10 001, 26,99 jusqu'à 25 001, 0,11 % au-delà, TTC`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  if (listing.currency !== CASH) return { ...shared, why: `${listing.currency} : le barème est en AUD` };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = brokerage(TABLES.standard, notional);
  const premiumSide = brokerage(TABLES.premium, notional);
  const commissionLocal = Number((side * 2).toPrecision(12));
  const commissionUsd = dollars(commissionLocal, CASH);
  const premiumMore = (premiumSide - side) * 2;
  const remark = premiumMore > 0 ? `Premium account is ${pct((100 * premiumMore) / notional)}% more.` : "";
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    `compte Premium : ${Number((premiumSide * 2).toFixed(2))} AUD l'aller-retour, en remarque`,
    "ligne en AUD : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    remark,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: { buy: side, sell: side, currency: CASH },
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
          brokerage: TABLES,
          gst: "included",
          cash: CASH,
          fx: 0,
          rule606: null,
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
    console.error("usage : node brokers/netwealth/netwealth_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
