// What one round trip costs at ThinkMarkets Australia, Cash Equities (TF
// Global Markets Equities (Aust) Pty Ltd, cleared by FinClear): buy n shares
// at price p on the ASX, sell them back at once, online, in dollars. CFDs
// are other products and stay out.
//
// thinkmarkets.com answers every script with a Cloudflare challenge, so the
// pages were read from the Internet Archive's copies (as the scraper does):
// trading-fees of 13 March 2026, cash-equities of 16 February 2026, and the
// equities Terms and Conditions (8 March 2024). Read again 2026-10-24.
//   Rate Card, "Cost incl GST":
//     Brokerage Fee   $8.00   "Per trade below $200,000"
//     Phone Orders    $27.50 per order (not this order)
//   Terms and Conditions, Fees and charges, "(incl. GST)":
//     Brokerage Fee   $8.00   "Per trade below $200,000"
//     Brokerage Fee   0.05 %  "Per trade above $200,000"
//   Cash-equities FAQ: "The brokerage fee is $8 per trade up to $200,000."
// So each buy and each sell pays A$8 up to A$200,000 and 0.05 % of the
// whole trade above, GST included. "Subscription fee Free", "Account
// opening fee Free", "ThinkMarkets never charges funding or hidden fees":
// no other charge on an order. Live streaming data ($22 a month, optional),
// rebooking, failed settlement, off-market transfer and SRN search fees are
// not this order. Australia has no stamp duty on listed shares.
//
// Cash is AUD (deposits.mjs), every line is in AUD: no FX.
// Book: the ASX book (XASX) through spreadLeaf, broker "thinkmarketsau".
//
//   https://www.thinkmarkets.com/au/support/trading-fees/
//   https://www.thinkmarkets.com/au/cash-equities/
//   https://www.thinkmarkets.com/tfxmain/media/img/pdf/TF-Global-Markets-Equities-(Aust)-Pty-Ltd-Terms-and-Conditions.pdf
//   https://web.archive.org/web/20260313/https://www.thinkmarkets.com/au/support/trading-fees/
//
//   node brokers/thinkmarketsau/thinkmarketsau_cost.mjs BHP ASX AUD --shares=100 --price=45
//   node brokers/thinkmarketsau/thinkmarketsau_cost.mjs VAS ASX AUD --shares=3000 --price=100
//   node brokers/thinkmarketsau/thinkmarketsau_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("thinkmarketsau-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.thinkmarkets.com/au/support/trading-fees/",
  page: "https://www.thinkmarkets.com/au/cash-equities/",
  terms: "https://www.thinkmarkets.com/tfxmain/media/img/pdf/TF-Global-Markets-Equities-(Aust)-Pty-Ltd-Terms-and-Conditions.pdf",
  archived: "https://web.archive.org/web/20260313/https://www.thinkmarkets.com/au/support/trading-fees/",
  readOn: "2026-10-24",
  termsOf: "2024-03-08",
  entity: "TF Global Markets Equities (Aust) Pty Ltd",
  venue: "ASX, cleared by FinClear",
};

const CASH = "AUD";
// Per trade, each side, GST included.
const FEE = { flat: 8, upTo: 200000, rate: 0.0005 };
const brokerage = (value) => (value <= FEE.upTo ? FEE.flat : value * FEE.rate);


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
    return { ...answer, why: "le catalogue ThinkMarkets n'existe pas encore : lancer `node brokers/thinkmarketsau/thinkmarketsau_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ThinkMarkets` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ThinkMarkets`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "thinkmarketsau",
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
    basis: `barème ThinkMarkets Cash Equities (copies de l'Internet Archive), relu le ${SCHEDULE.readOn} : 8 AUD par ordre jusqu'à 200 000 AUD, 0,05 % au-delà, TTC`,
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
  const side = brokerage(notional);
  const commissionLocal = Number((side * 2).toPrecision(12));
  const commissionUsd = dollars(commissionLocal, CASH);
  const remark = "";
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
          brokerage: FEE,
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
    console.error("usage : node brokers/thinkmarketsau/thinkmarketsau_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
