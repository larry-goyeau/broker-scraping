// What one round trip costs at Sequoia Direct (a trading name of Sequoia
// Wealth Management Pty Ltd, AFSL 472387; execution and clearing through
// Morrison Securities): buy n shares at price p on the ASX, sell them back at
// once, online order (Morrison Equix app), in dollars.
//
// Rates & Fees page, read 2026-10-26, "ASX Shares and Warrants":
//   "ASX rates - Starting form $12.00 or 0.08%, whichever is greater (plus GST)"
// So each side pays max(12 AUD, 0.08 % of the value) plus 10 % GST, i.e.
// max(13.20 AUD, 0.088 %); the minimum binds up to 15,000 AUD. "Starting
// from" names no ceiling online; the only upper figure is the Financial
// Services Guide's "Up to $220 or 2.2% of the transaction value, whichever is
// the greater" for securities, and the FAQ ties the FSG to phone orders
// ("phone rates apply, see FSG for details"), so the online row takes the
// fee page's figure and the FSG range is left out (phone).
// ETFs (listed managed investment schemes) pay the same ASX share rate: the
// page prints one line for ASX shares. No exchange, clearing or settlement
// line is printed; Australia has no stamp duty on listed shares. Left out:
// phone orders (FSG), EQUIX Live Data ($50.00 a month, optional; EQUIX
// Click2Refresh is free), the $1.50 posted contract note, fail, rebooking
// and off-market transfer fees, and the account administration charge of the
// FSG ("does not apply to all types of accounts").
//
// Cash is AUD (linked Macquarie Cash Management Account or nominated cash
// account), every line is in AUD: no FX.
// Book: the ASX (XASX) book through spreadLeaf, broker "sequoiadirect".
//
//   https://www.sequoiadirect.com.au/trading/rates-and-fees/
//   https://www.sequoiadirect.com.au/support/frequently-asked-questions/
//   https://www.sequoiadirect.com.au/wp-content/uploads/2025/02/Josh-Graham-merged-FSG-v17-17-February-2025.pdf
//
//   node brokers/sequoiadirect/sequoiadirect_cost.mjs BHP ASX AUD --shares=20 --price=45
//   node brokers/sequoiadirect/sequoiadirect_cost.mjs VAS ASX AUD --shares=15 --price=100
//   node brokers/sequoiadirect/sequoiadirect_cost.mjs CBA ASX AUD --shares=150 --price=160
//   node brokers/sequoiadirect/sequoiadirect_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("sequoiadirect-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.sequoiadirect.com.au/trading/rates-and-fees/",
  faq: "https://www.sequoiadirect.com.au/support/frequently-asked-questions/",
  fsg: "https://www.sequoiadirect.com.au/wp-content/uploads/2025/02/Josh-Graham-merged-FSG-v17-17-February-2025.pdf",
  readOn: "2026-10-26",
  entity: "Sequoia Wealth Management Pty Ltd (AFSL 472387), Sequoia Direct; clearing Morrison Securities",
  channel: "online (Morrison Equix), ASX Shares and Warrants",
  venue: "ASX",
};

const CASH = "AUD";
const GST = 0.1;
// Per trade, each side, before GST: the greater of a minimum and a rate.
const TARIFF = { min: 12, rate: 0.0008 };

function brokerage(value) {
  return Math.max(TARIFF.min, value * TARIFF.rate) * (1 + GST);
}

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
    return { ...answer, why: "le catalogue Sequoia Direct n'existe pas encore : lancer `node brokers/sequoiadirect/sequoiadirect_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Sequoia Direct` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Sequoia Direct`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sequoiadirect",
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
    basis: `barème Sequoia Direct, actions ASX en ligne, relu le ${SCHEDULE.readOn} : le plus élevé de 12 AUD et 0,08 % à chaque sens, plus GST 10 % (13,20 AUD ou 0,088 %)`,
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
  const side = Number(brokerage(notional).toPrecision(12));
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
    "« starting from » sans plafond en ligne ; la fourchette du FSG (jusqu'à 220 AUD ou 2,2 %) vise le téléphone, laissée de côté",
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
          brokerage: TARIFF,
          gst: GST,
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
    console.error("usage : node brokers/sequoiadirect/sequoiadirect_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
