// What one round trip costs at Selfwealth (SelfWealth Pty Ltd, AFSL
// 421789, part of Syfe): buy n shares at price p on the ASX, Cboe Australia
// (TMX Australia) or a US exchange, sell them back at once, online order,
// in dollars.
//
// Pricing page ("Prices include GST and are current for online share
// trading orders as at 01/10/26"), read 2026-10-26:
//   Australian shares and ETFs  "$9.50 flat brokerage per trade", AUD, GST
//                               included, any order size. TMX Australia
//                               (formerly Cboe Australia) is the second
//                               book of the same "Australian trading".
//   US shares and ETFs          "$0 USD brokerage until 31 October 2026,
//                               then $9.50 USD flat per trade"; the US
//                               trading page: "$0 Brokerage ... is
//                               applicable to new customers". So 0 through
//                               2026-10-31, 9.50 USD from 1 November (the
//                               day the trip is priced decides).
// Help centre, "What fees am I charged when trading US shares?" (updated
// 2026-09-03): on every US sell the FINRA Trading Activity Fee, "USD
// $0.000195 per share", maximum "USD $9.79" (no minimum printed); a
// Financial Transactions Tax on some US-listed foreign stocks, "typically
// less than 0.3%" (taxMap.mjs by ISIN). No SEC fee is printed: 0, like the
// other files. ADR fees, dividend and corporate-action fees are not this
// trade.
// FX, help centre "What is the foreign exchange rate used for international
// cash transfers?" (updated 2026-08-12): AUD to USD and USD to AUD "60 BPS
// (0.006)", built into the rate. The account is funded in AUD only
// (deposits.mjs): a US line converts on the buy and back on the sale, 0.6 %
// of the amount each way, in the total. Selfwealth Premium (A$29 a month) is
// data and research, not a different brokerage: no plan.
//
// Book: ASX (XASX) or Cboe Australia (CHIA), the row's own book. US: the
// 605 effective spread times the Q of the US dealer. Accounts opened since
// 14 August 2026 are held "with Alpaca Securities LLC, trading as Alpaca
// Clearing" (help centre, "How are my Selfwealth International holdings and
// cash protected?"); spreads/rule606.mjs needs `selfwealth: "alpaca"` for
// that Q, and without it the book is the quoted NBBO.
//
//   https://www.selfwealth.com.au/pricing
//   https://www.selfwealth.com.au/us-trading
//   https://help.selfwealth.com.au/hc/en-au/articles/4540923413261-What-fees-am-I-charged-when-trading-US-shares
//   https://help.selfwealth.com.au/hc/en-au/articles/4539723882509-What-is-the-foreign-exchange-rate-used-for-international-cash-transfers
//   https://help.selfwealth.com.au/hc/en-au/articles/4539636627725-How-are-my-Selfwealth-International-holdings-and-cash-protected
//
//   node brokers/selfwealth/selfwealth_cost.mjs BHP ASX AUD --shares=100 --price=45
//   node brokers/selfwealth/selfwealth_cost.mjs BHP "Cboe Australia" AUD --shares=1000 --price=45
//   node brokers/selfwealth/selfwealth_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/selfwealth/selfwealth_cost.mjs SPY ARCX USD --shares=2 --price=650
//   node brokers/selfwealth/selfwealth_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "selfwealth";
const CATALOGUE = new URL("selfwealth-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.selfwealth.com.au/pricing",
  us: "https://help.selfwealth.com.au/hc/en-au/articles/4540923413261-What-fees-am-I-charged-when-trading-US-shares",
  fx: "https://help.selfwealth.com.au/hc/en-au/articles/4539723882509-What-is-the-foreign-exchange-rate-used-for-international-cash-transfers",
  readOn: "2026-10-26",
  entity: "SelfWealth Pty Ltd (AFSL 421789)",
};

const BASE = "AUD";
const AU_FLAT = 9.5; // AUD a trade, GST included
const US_FLAT = 9.5; // USD a trade after the offer
const US_FREE_UNTIL = "2026-10-31";
const TAF_PER_SHARE = 0.000195;
const TAF_MAX = 9.79;
const FX_ONE_WAY = 0.006;
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "TXSE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** US brokerage a trade, in USD, on the day the trip is priced. */
export function usFlat(on = today()) {
  return on <= US_FREE_UNTIL ? 0 : US_FLAT;
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is Selfwealth's
 * brokerage and its forced conversion.
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
    cashCurrency: BASE,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Selfwealth n'existe pas encore : lancer `node brokers/selfwealth/selfwealth_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Selfwealth` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Selfwealth`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const american = US_MICS.has(code(listing.mic)) && listing.currency === "USD";
  const settle = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, settle);
  const flatUs = usFlat();
  const basis = american
    ? `barème Selfwealth relu le ${SCHEDULE.readOn} : ${flatUs ? `${US_FLAT} USD l'ordre` : `0 USD l'ordre jusqu'au ${US_FREE_UNTIL} (offre aux nouveaux clients), puis ${US_FLAT} USD`}, TAF ${TAF_PER_SHARE} USD la part vendue (max ${TAF_MAX}), SEC non imprimée (0) ; change forcé AUD ↔ USD 0,6 % par sens (60 bps), compte en AUD seulement`
    : `barème Selfwealth relu le ${SCHEDULE.readOn} : ${AU_FLAT} AUD l'ordre, TTC, ASX comme Cboe Australia (TMX)`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? settle : BASE,
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? 0 : FX_ONE_WAY * 2,
  };
  if (!american && listing.currency !== BASE) {
    return { ...shared, why: `${listing.currency} sur ${listing.exchange} : Selfwealth n'imprime que l'ASX, Cboe Australia et les États-Unis` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = american ? flatUs : AU_FLAT;
  const commissionUsd = dollars(side * 2, american ? "USD" : BASE);
  const tafUsd = american ? Math.min(TAF_MAX, TAF_PER_SHARE * n) : 0;
  // Forced conversion: AUD in on the buy, back to AUD on the sale.
  const fxUsd = held ? 0 : notionalUsd == null ? null : notionalUsd * FX_ONE_WAY * 2;
  const brokerFees = plus(commissionUsd, fxUsd);

  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  const q = american ? qOf(FOLDER) : null;
  let marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  let marketPerShare = perShare ?? (american ? null : book.leaf?.perShare ?? null);
  if (american && bp == null && perShare == null) {
    marketPerShare = usBookPerShare({ broker: FOLDER, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (v) => dollars(v, listing.currency),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, commissionUsd, fxUsd, tafUsd, taxUsd);

  const unknown = [
    bookUsd == null
      ? american
        ? `pas de carnet 605 pour ${listing.ticker || etf}`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);
  const confidence = [
    basis,
    american ? `TAF ${Number(tafUsd.toPrecision(4))} USD sur la vente` : "ligne en AUD : pas de change",
    american && !held ? `change forcé ${finite(fxUsd, 6)} $ (0,6 % à l'aller et au retour)` : null,
    taxPct ? `taxe ${Object.entries(taxRates(tax)).map(([k, v]) => `${k} ${(100 * v).toFixed(2)} %`).join(", ")} (taxMap.mjs)` : null,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? q != null
          ? `carnet 605 × Q (Alpaca), ${marketPerShare} $ la part`
          : `NBBO coté ${marketPerShare} $ la part : pas de Q pour selfwealth dans spreads/rule606.mjs`
        : null,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    commission: { each: side, currency: american ? "USD" : BASE, eachWay: true },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      réglementaire: finite(tafUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    tax,
    confidence,
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
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          asx: `${AU_FLAT} AUD a trade, GST included (ASX and Cboe Australia)`,
          usBrokerage: `0 USD through ${US_FREE_UNTIL}, then ${US_FLAT} USD a trade; today ${usFlat()} USD`,
          taf: `${TAF_PER_SHARE} USD a share sold, max ${TAF_MAX}`,
          fxRule: "0.6% AUD<->USD each way, in the total (AUD cash only)",
        },
        null,
        2
      )
    );
    return;
  }
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/selfwealth/selfwealth_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
