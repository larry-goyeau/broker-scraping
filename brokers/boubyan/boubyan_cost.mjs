// What one round trip costs at Boubyan Capital: buy n shares at price p,
// sell them back at once, in dollars.
//
// Boubyan Capital Investment Company K.S.C.C. The catalogue is the sharia
// lists linked from the brokerage page (`boubyan_scraping.mjs`). No ISIN.
// Sukuk are sold and are not in that catalogue.
//
// Appendix A, revision February 2026, inside the account agreement of
// 24 August 2026. Appendix B, revision August 2026. Commission per
// executed trade, at the printed floor. A per-trade custody ticket on
// London and Europe is part of the same bill. An annual custody rate is
// not, and stays out.
//
//   United States     0.20 %, minimum 20 USD
//                     under 1 USD: plus 0.002 USD a share, capped at 0.75 %
//   London            0.30 %, minimum 20 GBP, plus 20 GBP custody a trade
//   Europe            0.30 %, minimum 20 EUR, plus 20 EUR custody a trade
//   Shanghai/Shenzhen 0.50 %, minimum 250 CNY
//   Hong Kong         0.50 %, minimum 250 HKD
//                     stamp 0.1 %, levy 0.0027 %, trading fee 0.005 %, both ways
//   Japan             0.20 %, minimum 2 500 JPY
//   Korea             0.20 %, minimum 20 000 KRW
//   Qatar             0.36 %, minimum 50 QAR
//   Bahrain           0.40 %, minimum 10 BHD (30 USD on a dollar line)
//   Egypt             0.38 %, minimum 45 EGP
//
// Dubai, Abu Dhabi and Muscat print a commission and then a tax with no
// rate, so those bills are not a number. Tadawul prints 0.155 % and names
// VAT with no rate: the commission is in the fee, the unnamed tax is not.
// Each says VAT applies to the intermediary's brokerage and prints no rate.
// Boursa Kuwait is 0.10 % on Premier, 0.15 % on Main and 0.30 % on Auction,
// floor 250 fils, and the row does not say which board.
//
// The agreement names an executing broker and does not say which. No Rule
// 606 mix is applied. A US line uses the quoted NBBO of that symbol.
//
// The sheet names SEC and TAF and prints no rate. The sell-side rates
// already used in this repository are applied, and that substitution is
// said in the result. CAT is not named. ADR conversion is 25 USD plus
// sponsor fees, and pre-market, post-market and overnight add a per-share
// charge: none of those is this regular-session trip. A transfer minimum
// and the 1 000 KWD opening minimum are not a ticket. The account is in
// dinars. No conversion fee is printed, so none is added.
//
// London and Cboe Europe print no currency. The UK card is in pounds and
// the Europe card is in euros, and the exchange column is the only split
// the list gives.
//
//   https://boubyancapital.com/brokerage/
//   https://boubyancapital.com/media/filer_public/b0/63/b063e80b-c56d-49a8-9de9-211048de0df8/individual_agreement-24aug2026.pdf
//   https://boubyancapital.com/media/filer_public/5e/e4/5ee40e02-7b24-4e81-b4fb-21658880eb12/appendixb-24aug2026.pdf
//
//   node brokers/boubyan/boubyan_cost.mjs AAPL NYSE USD --shares=10 --price=230
//   node brokers/boubyan/boubyan_cost.mjs ISDW LSE --shares=10 --price=5
//   node brokers/boubyan/boubyan_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("boubyan-parsed.json", import.meta.url);

const SCHEDULE = {
  page: "https://boubyancapital.com/brokerage/",
  appendixA:
    "https://boubyancapital.com/media/filer_public/b0/63/b063e80b-c56d-49a8-9de9-211048de0df8/individual_agreement-24aug2026.pdf",
  appendixB:
    "https://boubyancapital.com/media/filer_public/5e/e4/5ee40e02-7b24-4e81-b4fb-21658880eb12/appendixb-24aug2026.pdf",
  readOn: "2026-09-29",
  appendixARevision: "2026-02",
  appendixBRevision: "2026-08",
  entity: "Boubyan Capital Investment Company K.S.C.C.",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CENT = 0.01;
const PENNY_PER_SHARE = 0.002;
const PENNY_CAP = 0.0075;

// `custody` is charged every trade, on top of the commission floor.
// Hong Kong's three rates are the exchange's, both ways.
const RULE = {
  us: { rate: 0.002, min: 20, ccy: "USD" },
  uk: { rate: 0.003, min: 20, custody: 20, ccy: "GBP" },
  europe: { rate: 0.003, min: 20, custody: 20, ccy: "EUR" },
  china: { rate: 0.005, min: 250, ccy: "CNY" },
  hk: { rate: 0.005, min: 250, ccy: "HKD", stamp: 0.001, levy: 0.000027, trading: 0.00005 },
  japan: { rate: 0.002, min: 2500, ccy: "JPY" },
  korea: { rate: 0.002, min: 20000, ccy: "KRW" },
  qatar: { rate: 0.0036, min: 50, ccy: "QAR" },
  bahrain: { rate: 0.004, min: 10, usdMin: 30, ccy: "BHD" },
  egypt: { rate: 0.0038, min: 45, ccy: "EGP" },
  // The card prints 0.155 % and then names VAT with no rate. The rate is
  // the commission. The unnamed tax stays out of the number, in the remark.
  saudi: { rate: 0.00155, min: 0, ccy: "SAR" },
};

const MARKET_OF = {
  NYSE: "us",
  NSDQ: "us",
  AMEX: "us",
  LSE: "uk",
  CHIX: "europe",
  XSHE: "china",
  XSHG: "china",
  CNSGSE: "china",
  HKEX: "hk",
  XTKS: "japan",
  XKRX: "korea",
  KSE: "kuwait",
  UAE: "uae",
  Saudi: "saudi",
  Qatar: "qatar",
  Bahrain: "bahrain",
  Oman: "oman",
  EGX: "egypt",
};

// The shared venue table reads KSE as Dubai. Boursa Kuwait is not that book.
const BOOK_EXCHANGE = {
  KSE: "BoursaKuwait",
  Saudi: "Tadawul",
  Oman: "Muscat",
  XSHE: "SZSE",
  XSHG: "SSE",
  CNSGSE: "SSE",
};

const UNPRICED = {
  kuwait:
    "Boursa Kuwait: 0.10% Premier, 0.15% Main, 0.30% Auction, floor 250 fils. The line does not say which board.",
  uae: "DFM and ADX: 0.30%, minimum 65 AED, plus 10 AED. VAT is named and has no rate.",
  saudi: "Tadawul: 0.155%. VAT is named and has no rate.",
  oman: "Muscat: 0.50%, minimum 5 OMR. VAT is named and has no rate.",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function feeMarketOf(row) {
  return MARKET_OF[row?.exchange] || null;
}

export function listingCurrency(row) {
  const printed = code(row?.currency);
  if (printed) return printed;
  const market = feeMarketOf(row);
  return RULE[market]?.ccy || "";
}

export function commissionSide({ market, notional, shares, price, currency }) {
  const rule = RULE[market];
  if (!rule || !(Number(notional) > 0)) return null;
  const min = market === "bahrain" && code(currency) === "USD" ? rule.usdMin : rule.min;
  let fee = Math.max(Number(notional) * rule.rate, min);
  if (market === "us" && Number(price) > 0 && Number(price) < 1 && Number(shares) > 0) {
    fee += Math.min(Number(shares) * PENNY_PER_SHARE, Number(notional) * PENNY_CAP);
  }
  if (rule.custody) fee += rule.custody;
  return fee;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exact = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  if (wantPlace && !exact.length) return { named, matches: [] };
  const pool = exact.length ? exact : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey({ ...r, exchange: BOOK_EXCHANGE[r.exchange] || r.exchange }) }))
    .filter((m) => !wantCurrency || listingCurrency(m.row) === wantCurrency);
  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.query} ${listingCurrency(r) || "?"} @ ${r.exchange || "venue not stated"}`)
    .slice(0, 12);

function remarkOf(market) {
  if (UNPRICED[market]) return UNPRICED[market];
  const lines = [];
  if (market === "us") {
    lines.push("Extended session $0.001 / share, overnight session $0.5 / share.");
  } else if (market === "uk" || market === "europe") {
    lines.push("Custody 0.05% / year.");
  } else if (market === "hk") {
    lines.push("Custody 0.10% / year.");
  } else if (market === "china" || market === "japan" || market === "korea") {
    lines.push("Custody 0.10% / year.");
  }
  return lines.join("\n");
}

function bookGap(listing, unsourced, market) {
  if (market === "us") return `${listing.ticker || "this name"} is absent from the quoted NBBO`;
  if (listing.mic && !listing.isin) return `no ISIN: the ${listing.exchange} book cannot be read`;
  const resolved = resolveVenue({ exchange: listing.brokerExchange, currency: listing.currency });
  const name = resolved.venue?.name || resolved.unsourced?.name || unsourced?.name || listing.exchange;
  const why = resolved.unsourced?.why || unsourced?.why || "no book page";
  return `no book for ${name}: ${why}`;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is Boubyan's
 * commission, twice, including the London and Europe custody ticket.
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
    cashCurrency: "KWD",
  };

  if (!catalogue) {
    return { ...answer, why: "the Boubyan catalogue is not here yet: run `node brokers/boubyan/boubyan_scraping.mjs`" };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Boubyan catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Boubyan`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const market = feeMarketOf(m.row);
  const ccy = listingCurrency(m.row);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: ccy,
    unsourced: m.unsourced,
    broker: "boubyan",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.row.exchange === "KSE" ? "Boursa Kuwait" : m.venue?.name || m.unsourced?.name || m.row.exchange,
    currency: ccy,
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (market === "us" && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "boubyan", ticker: m.row.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const tax = taxesOf(listing.isin);
  const rates = { ...taxRates(tax) };
  delete rates.PTM_LEVY;
  delete rates.PTM;
  const taxPct = Object.values(rates).reduce((sum, rate) => sum + rate, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    venueAuthoritative: m.row.exchange === "KSE",
    remark: remarkOf(market),
    bp: marketBp,
    perShare: marketPerShare,
    url: market === "us" || market === "uk" || market === "europe" || market === "china" || market === "hk" || market === "japan" || market === "korea"
      ? SCHEDULE.appendixB
      : SCHEDULE.appendixA,
    basis: `Boubyan schedule ${market || m.row.exchange}, read on ${SCHEDULE.readOn}`,
    tax,
    fx: fxNote(ccy),
    fxIfConverted: 0,
  };

  if (!market) {
    return { ...shared, why: `no Boubyan schedule for ${m.row.exchange}` };
  }
  if (UNPRICED[market] && !RULE[market]) {
    return { ...shared, why: UNPRICED[market] };
  }
  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "no share count" : "no price for this line: run node assets/prices.mjs",
    };
  }

  const each = commissionSide({ market, notional, shares: n, price: p, currency: ccy });
  const brokerFees = dollars(each * 2, ccy);
  const notionalUsd = dollars(notional, ccy);
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const mapTaxUsd = notionalUsd == null ? 0 : notionalUsd * taxPct;

  const rule = RULE[market];
  const stampUsd = rule.stamp ? dollars(notional * rule.stamp * 2, ccy) : 0;
  const thirdNative = (rule.levy || 0) + (rule.trading || 0);
  const thirdUsd = thirdNative ? dollars(notional * thirdNative * 2, ccy) : 0;
  const secUsd = market === "us" ? up(notional * SEC_RATE) : 0;
  const tafUsd = market === "us" ? up(Math.min(n * TAF_PER_SHARE, TAF_CAP)) : 0;
  const usd = plus(bookUsd, brokerFees, stampUsd, thirdUsd, mapTaxUsd, secUsd, tafUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null ? { why: bookGap(listing, m.unsourced, market) } : {}),
    ...(brokerFees == null ? { why: `no ${ccy} rate to convert the commission` } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: ccy,
    },
    commission: { each, currency: ccy, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(plus(thirdUsd, secUsd, tafUsd), 6),
      taxes: finite(plus(stampUsd, mapTaxUsd), 6),
    },
    sell: market === "us" ? { sec: finite(secUsd, 6), taf: finite(tafUsd, 6) } : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    const by = {};
    for (const r of rows) by[r.exchange] = (by[r.exchange] || 0) + 1;
    console.log(JSON.stringify({ ...SCHEDULE, rule: RULE, unpriced: UNPRICED, listings: by }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage: node brokers/boubyan/boubyan_cost.mjs <ticker> [venue] [currency] [--shares=n] [--price=p]\n" +
        "        node brokers/boubyan/boubyan_cost.mjs --schedule"
    );
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

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(`\n${out.alternatives.join("\n")}`);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency || "—"}  [${out.feeMarket}]\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} shares at ${t.price} ${t.currency} = ${t.notional} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd} $)` : "") +
        "\n"
    );
  }
  console.log(`round trip       : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
  console.log(`broker fees      : ${show(out.brokerFees)} $`);
  if (out.remark) for (const line of out.remark.split("\n")) console.log(`  · ${line}`);
}
