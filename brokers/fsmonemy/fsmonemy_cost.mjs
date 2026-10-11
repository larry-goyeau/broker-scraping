// What one round trip costs at FSMOne Malaysia (iFAST Capital Sdn. Bhd.):
// buy n shares at price p, sell them back at once, in dollars. Stocks and
// ETFs on the places the fee call prices. Funds, bonds and the ETF
// regular savings plan stay out.
//
// Re-read 2026-10-10 from
// /rest/stock/fee/fee-details/read?stockCode=&exchangeId=
// and /rest/stock/fee/fx-rate/read. Processing is a percent of the
// notional with a floor, each way, rounded half up to the cent after the
// floor. A rate of 0 with a floor is the flat ETF fee. Exchange fees use
// the call's own mode: a percent of the notional, a rate per share, or
// the Malaysia stamp. That stamp is 0.1% of the notional turned into
// ringgit at the published rate, raised to the next ringgit, capped, then
// turned back into the listing currency. The rate is one number, not a
// bid and an offer, so it is not an FX markup. The cash-account board
// does publish a bid and an offer. Half that gap stays in the remark.
// The round trip does not pay it.
//
//   Bursa stock   0.05% min 8.80 MYR. Clearing 0.03% max 1,000, ceiling
//                 to the cent. Stamp 0.1% ceiling to the ringgit, max 1,000.
//   Bursa ETF     0.03% min 3.80 MYR, and 8% SST on the processing fee and
//                 on the clearing fee. No Bursa stamp.
//   US listed     stock 0.08% min 3.80 USD. ETF flat 3.80 USD. CAT
//                 0.000004 USD a share each way, min 0.01. SEC 0.00206%
//                 on the sell, ceiling to the cent, min 0.01. The call
//                 prints the TAF at 0.
//   US OTC        same processing. CAT and the SEC fee are on the sell
//                 only.
//   HKEX          stock 0.08% min 50 in HKD or CNY, min 8.80 in USD.
//                 ETF flat 38 in HKD or CNY, flat 3.80 in USD. Trading
//                 0.00565%, SFC 0.0027%, AFRC 0.00015%, CCASS 0.0042%.
//                 Share stamp 0.1% ceiling to the next unit. An ETF pays
//                 no exchange stamp.
//   SGX           0.08% min 8.80 in SGD, USD, EUR or GBP, min 50 in HKD
//                 or CNY. Clearing 0.0325% and trading 0.0075%, plus two
//                 settlement flats.
//   China         0.08% min 40 CNY. A share pays handling 0.00341%,
//                 transfer 0.003% and the securities fee 0.002% each way,
//                 and stamp 0.05% on the sell. An ETF pays handling 0.004%
//                 and transfer 0.002%, and no stamp.
//   LSE           0.15% min 15 GBP, 20 USD or 18 EUR. A sterling share
//                 also pays 0.5% stamp on the buy and the PTM levy.
//
// The Malaysia stamp cap is 1,000 ringgit on a share and 200 on an ETF.
// The one USD share on HKEX is capped at 200, which is what the call
// returned for it. UK stamp from the tax map is not added on top of the
// stamp this call already bills. A US line uses the Rule 606 mix of
// iFAST Securities US Corporation (CRD 327903).
//
//   https://www.fsmone.com.my/pricing/stocks
//   https://www.fsmone.com.my/rest/stock/fee/fee-details/read
//
//   node brokers/fsmonemy/fsmonemy_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/fsmonemy/fsmonemy_cost.mjs 1155 KLSE MYR --shares=100 --price=10
//   node brokers/fsmonemy/fsmonemy_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("fsmonemy-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.fsmone.com.my/pricing/stocks",
  fees: "https://www.fsmone.com.my/rest/stock/fee/fee-details/read",
  fx: "https://www.fsmone.com.my/rest/stock/fee/fx-rate/read",
  readOn: "2026-10-10",
  entity: "FSMOne Malaysia",
  venue: "the exchange named on the line",
};

// Ringgit per 1 unit of the listing currency, fee/fx-rate/read on 2026-10-10.
// The cash board is a second reading, foreign-exchange/all-rates/read the
// same evening. Bid is the ringgit a sale of one unit pays. Offer is the
// ringgit a purchase of one unit costs.
const FX_HOME = "MYR";
const FX_BOARD = {
  USD: [4.05660645, 4.11355451],
  SGD: [3.17034779, 3.21178164],
  HKD: [0.5172045, 0.52395154],
  EUR: [4.55229868, 4.61175821],
  GBP: [5.37299434, 5.44322138],
  JPY: [0.02563121, 0.02598175],
  CNY: [0.60644182, 0.61434713],
  AUD: [2.83202089, 2.86904579],
};

function remarkOf(currency) {
  const ccy = listingCash(currency);
  if (!ccy || ccy === FX_HOME) return "";
  const pair = FX_BOARD[ccy];
  if (!pair) return "";
  const [bid, offer] = pair;
  const half = ((offer - bid) / (offer + bid)) * 100;
  return fxRemark(half.toFixed(3), ccy);
}

const MYR_PER = {
  HKD: 0.521,
  AUD: 2.8462,
  SGD: 3.1927,
  JPY: 0.02587,
  EUR: 4.586,
  GBP: 5.4107,
  USD: 4.0888,
  MYR: 1,
  CNY: 0.5829,
};

const US_LISTED = new Set(["NASDAQ", "NYSE", "AMEX", "BATS"]);
const SGX_MIN = { SGD: 8.8, USD: 8.8, EUR: 8.8, GBP: 8.8, HKD: 50, CNY: 50 };
const SGX_FLAT = { SGD: 0.35, USD: 0.27, EUR: 0.26, GBP: 0.23, HKD: 2.14, CNY: 2 };
const LSE_MIN = { GBP: 15, USD: 20, EUR: 18 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function fundLike(type) {
  return type === "ETF" || type === "ETC" || type === "ETN";
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

function roundFee(amount, dp, mode) {
  const scale = 10 ** dp;
  let t = Number((amount * scale).toFixed(4));
  if (mode === "CEILING" || mode === "ROUND UP") t = Math.ceil(t - 1e-9);
  else if (mode === "ROUND DOWN") t = Math.floor(t + 1e-9);
  else t = Math.round(t);
  return Number((t / scale).toFixed(2));
}

function minMax(amount, min, max) {
  if (min > 0 && amount < min) return min;
  if (max > 0 && amount > max) return max;
  return amount;
}

function amountFee(notional, fee) {
  let s = (fee.rate * notional) / 100;
  s = roundFee(s, fee.dp, fee.round);
  s *= fee.mult || 1;
  s = minMax(s, fee.min, fee.max);
  const tax = fee.tax > 0 ? roundFee(s * fee.tax, 2, "ROUND HALF UP") : 0;
  return s + tax;
}

function quantityFee(shares, fee) {
  let s = fee.rate * shares;
  s = roundFee(s, fee.dp, fee.round);
  s *= fee.mult || 1;
  return minMax(s, fee.min, fee.max);
}

function myStamp(notional, currency, max) {
  const per = MYR_PER[code(currency)];
  if (!(per > 0)) return null;
  let s = (0.1 * notional * per) / 100;
  s = roundFee(s, 0, "CEILING");
  s = minMax(s, 0, max);
  s /= per;
  return roundFee(s, 2, "ROUND HALF UP");
}

function fee(partial) {
  return {
    rate: 0,
    min: 0,
    max: null,
    round: "ROUND HALF UP",
    dp: 2,
    mult: 1,
    tax: 0,
    mode: "AMOUNT",
    ...partial,
  };
}

function myStampMax(listing) {
  if (fundLike(listing.type)) return 200;
  if (listing.brokerExchange === "HKEX" && listing.currency === "USD") return 200;
  return 1000;
}

function processingOf(listing) {
  const exchange = listing.brokerExchange;
  const fund = fundLike(listing.type);
  const currency = listing.currency;
  if (exchange === "KLSE") {
    return fund
      ? { rate: 0.03, min: 3.8, tax: 0.08, currency: "MYR" }
      : { rate: 0.05, min: 8.8, tax: 0, currency: "MYR" };
  }
  if (US_LISTED.has(exchange) || exchange === "USOTC") {
    return fund
      ? { rate: 0, min: 3.8, tax: 0, currency: "USD" }
      : { rate: 0.08, min: 3.8, tax: 0, currency: "USD" };
  }
  if (exchange === "HKEX") {
    if (currency === "USD") return fund ? { rate: 0, min: 3.8, tax: 0, currency } : { rate: 0.08, min: 8.8, tax: 0, currency };
    if (currency === "HKD" || currency === "CNY") {
      return fund ? { rate: 0, min: 38, tax: 0, currency } : { rate: 0.08, min: 50, tax: 0, currency };
    }
    return null;
  }
  if (exchange === "SGX") {
    const min = SGX_MIN[currency];
    if (min == null) return null;
    return { rate: 0.08, min, tax: 0, currency };
  }
  if (exchange === "SSE" || exchange === "SZSE") {
    if (currency !== "CNY") return null;
    return { rate: 0.08, min: 40, tax: 0, currency: "CNY" };
  }
  if (exchange === "LSE") {
    const min = LSE_MIN[currency];
    if (min == null) return null;
    return { rate: 0.15, min, tax: 0, currency };
  }
  return null;
}

function exchangeSides(listing) {
  const exchange = listing.brokerExchange;
  const fund = fundLike(listing.type);
  const currency = listing.currency;
  const buy = [];
  const sell = [];
  const both = (row) => {
    buy.push(row);
    sell.push(row);
  };
  const stampMax = myStampMax(listing);
  if (exchange !== "KLSE") both(fee({ name: "MY_STAMP_DUTY", mode: "MY_STAMP", max: stampMax }));

  if (exchange === "KLSE") {
    both(fee({ name: "CLEARING_FEE", rate: 0.03, max: 1000, round: "CEILING", tax: fund ? 0.08 : 0 }));
    if (!fund) both(fee({ name: "STAMP_DUTY", rate: 0.1, max: 1000, round: "CEILING", dp: 0 }));
    return { buy, sell, stamps: !fund };
  }
  if (US_LISTED.has(exchange) || exchange === "USOTC") {
    const cat = fee({ name: "CAT_FEE", mode: "QUANTITY", rate: 0.000004, min: 0.01 });
    const sec = fee({ name: "SEC", rate: 0.00206, min: 0.01, round: "CEILING" });
    if (US_LISTED.has(exchange)) both(cat);
    else sell.push(cat);
    sell.push(sec);
    return { buy, sell, stamps: false };
  }
  if (exchange === "HKEX") {
    both(fee({ rate: 0.0042 }));
    both(fee({ rate: 0.00015 }));
    both(fee({ rate: 0.00565 }));
    both(fee({ rate: 0.0027 }));
    if (!fund) both(fee({ name: "STAMP_DUTY", rate: 0.1, round: "CEILING", dp: 0 }));
    return { buy, sell, stamps: !fund };
  }
  if (exchange === "SGX") {
    const flat = SGX_FLAT[currency];
    if (flat == null) return null;
    both(fee({ rate: 0.0325 }));
    both(fee({ rate: 0.0075 }));
    both(fee({ min: flat, max: flat }));
    both(fee({ min: flat, max: flat }));
    return { buy, sell, stamps: false };
  }
  if (exchange === "SSE" || exchange === "SZSE") {
    if (fund) {
      both(fee({ rate: 0.004 }));
      both(fee({ rate: 0.002 }));
    } else {
      both(fee({ rate: 0.00341 }));
      both(fee({ rate: 0.003 }));
      both(fee({ rate: 0.002 }));
      sell.push(fee({ name: "STAMP_DUTY", rate: 0.05 }));
    }
    return { buy, sell, stamps: !fund };
  }
  if (exchange === "LSE") {
    if (!fund && currency === "GBP") {
      buy.push(fee({ name: "STAMP_DUTY", rate: 0.5 }));
      const ptm = fee({ name: "PTM", rate: 0.01, max: 1.5, round: "ROUND DOWN", dp: 0, mult: 1.5 });
      both(ptm);
      return { buy, sell, stamps: true };
    }
    return { buy, sell, stamps: false };
  }
  return null;
}

function processingOne(listing, notional) {
  const rule = processingOf(listing);
  if (!rule) return null;
  const raw = rule.rate ? (rule.rate * notional) / 100 : 0;
  const floored = minMax(raw, rule.min, null);
  const amount = roundFee(floored, 2, "ROUND HALF UP");
  const tax = rule.tax > 0 ? roundFee(floored * rule.tax, 2, "ROUND HALF UP") : 0;
  return { amount: amount + tax, currency: rule.currency, each: amount };
}

function sideTotal(rows, notional, shares, currency) {
  let sum = 0;
  for (const row of rows) {
    if (row.mode === "MY_STAMP") {
      const stamp = myStamp(notional, currency, row.max);
      if (stamp == null) return null;
      sum += stamp;
    } else if (row.mode === "QUANTITY") sum += quantityFee(shares, row);
    else if (row.rate > 0 || row.min > 0) sum += amountFee(notional, row);
  }
  return sum;
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
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue FSMOne Malaysia n'existe pas encore : lancer `node brokers/fsmonemy/fsmonemy_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue FSMOne Malaysia` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez FSMOne Malaysia`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "fsmonemy",
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
  const american = (US_LISTED.has(listing.brokerExchange) || listing.brokerExchange === "USOTC") && listing.currency === "USD";
  const leaf = book.leaf;
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && bp == null && perShare == null && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "fsmonemy", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const schedule = exchangeSides(listing);
  const taxTotal = Object.entries(taxRates(tax)).reduce((s, [name, rate]) => {
    if (schedule?.stamps && /STAMP/i.test(name)) return s;
    return s + rate;
  }, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    remark: remarkOf(listing.currency),
    basis: `barème FSMOne Malaysia, appel des frais relu le ${SCHEDULE.readOn}`,
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
  const one = processingOne(listing, notional);
  if (!one || !schedule) {
    return { ...shared, why: `${listing.brokerExchange} ${listing.currency} n'a pas de ligne dans le barème FSMOne Malaysia` };
  }
  const processingUsd = dollars(one.amount * 2, one.currency);
  const buyLocal = sideTotal(schedule.buy, notional, n, listing.currency);
  const sellLocal = sideTotal(schedule.sell, notional, n, listing.currency);
  const exchangeUsd =
    buyLocal == null || sellLocal == null ? null : dollars(buyLocal + sellLocal, listing.currency);
  const ticketUsd = plus(processingUsd, exchangeUsd);
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, ticketUsd, taxUsd);
  const confidence = [
    shared.basis,
    fundLike(listing.type) ? "barème ETF" : "barème action",
    `${one.each} ${one.currency} de traitement par sens`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? american
          ? `carnet ${marketPerShare} $ la part, mélange 606 d'iFAST Securities US`
          : `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(ticketUsd, 6),
    commission: { each: one.each, currency: one.currency, eachWay: true },
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
      courtage: finite(processingUsd, 6),
      bourse: finite(exchangeUsd, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, myrPer: MYR_PER }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/fsmonemy/fsmonemy_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.bourse) console.log(`  bourse         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
