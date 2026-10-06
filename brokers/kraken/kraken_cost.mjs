// What one round trip costs at Kraken: buy n shares at price p, or put a
// number of dollars into a coin, and sell straight back. The answer is one
// number in dollars. `brokerFees` is what Kraken keeps.
//
// Two companies, two schedules, re-read 2026-10-01.
//
// Stocks and ETFs are Kraken Securities LLC. Commission is 0. On the sale
// they pass the regulators they print (page last updated 18 August 2026):
//
//   FINRA TAF    $0.000166 a share, rounded to the nearest cent, never
//                more than $8.30
//   SEC          $27.80 per $1 million of principal, rounded up to the
//                next cent
//
// That is their print, not the 0.000195 / $9.79 and 0.0000206 the other
// American files use. French FTT is not named, so it stays out.
//
// Coins are the spot book (Payward), not Instant Buy. A round trip that
// sells straight back crosses the book twice, so both legs are taker.
// The visitor has no 30-day volume, so the tier is the first one, from
// the 9 July 2026 table: taker 0.80 % a leg. Maker 0.40 % is a resting
// order and is not this trip. Stablecoin pairs are on the same table:
// Kraken says they do not count toward the volume, and does not print
// them a different rate. Higher tiers are volume the page does not have.
//
// An xStock (IEMGx) is neither of those. There is no tape to add, so the
// published fee is the whole bill, the way a coin's is. Outside the EEA a
// round trip that sells straight back is taker both ways on the Pro book:
// 0.10 % a leg from the first tier (fee schedule, 29 September 2026).
// That book is closed to the EEA. An EEA account can hold dollars, so the
// trip is a purchase in USD or USDG, which is 0, and no FX is added.
// Paying with another currency, or converting, is 1 % a leg and is not
// this trip. The spread inside the quote is not printed, so it is not added.
//
//   https://support.kraken.com/articles/getting-started-with-equities
//   https://support.kraken.com/articles/cross-platform-fee-tier-changes
//   https://support.kraken.com/articles/xstocks-faq
//   https://www.kraken.com/stocks
//
//   node brokers/kraken/kraken_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/kraken/kraken_cost.mjs BTC CRYPTO USD --amount=100
//   node brokers/kraken/kraken_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { EEA } from "../../accepted.mjs";
import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite, bookParts } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("kraken-parsed.json", import.meta.url);

const SCHEDULE = {
  equities: "https://support.kraken.com/articles/getting-started-with-equities",
  tiers: "https://support.kraken.com/articles/cross-platform-fee-tier-changes",
  xstocks: "https://www.kraken.com/features/fee-schedule",
  xstocksFaq: "https://support.kraken.com/articles/xstocks-faq",
  stocks: "https://www.kraken.com/stocks",
  readOn: "2026-10-01",
  equitiesAsOf: "2026-08-18",
  tiersAsOf: "2026-07-09",
  xstocksAsOf: "2026-09-29",
  equityEntity: "Kraken Securities LLC",
  cryptoEntity: "Payward",
};

const SEC_PER_MILLION = 27.8;
const TAF_PER_SHARE = 0.000166;
const TAF_CAP = 8.3;
// Tier 1, no 30-day volume. A marketable round trip is taker both ways.
const TAKER = 0.008;
// Pro xStocks, first tier ($0+). Maker −0.02 % is a resting order.
const XSTOCK_TAKER = 0.001;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || loose(row?.exchange) === "CRYPTO";
const isXstock = (row) => row?.xstock === true || loose(row?.exchange) === "XSTOCK";

const nearestCent = (x) => Math.round(x * 100) / 100;
const ceilCent = (x) => Math.ceil(x * 100 - 1e-9) / 100;

function tafOf(shares) {
  const raw = TAF_PER_SHARE * shares;
  if (raw >= TAF_CAP) return TAF_CAP;
  return nearestCent(raw);
}

function secOf(notionalUsd) {
  return ceilCent((notionalUsd * SEC_PER_MILLION) / 1e6);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = loose(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const coins = named.filter(isCrypto);
  if (coins.length && (!wantPlace || wantPlace === "CRYPTO")) {
    const pool = wantCurrency ? coins.filter((r) => loose(r.currency) === wantCurrency) : coins;
    const picked = pool.length ? pool : coins;
    return { named, matches: picked.map((r) => ({ row: r, ...listingKey(r) })) };
  }
  const equities = named.filter((r) => !isCrypto(r));
  const want = place ? listingKey({ exchange: place, mic: place }) : {};
  const matches = equities
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || loose(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price`, or putting `amount` dollars
 * into a coin, and selling straight back. `usd` is what the page prints.
 * `brokerFees` is Kraken's commission: 0 on a share, the taker fee on a coin.
 */
export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, perShare = null, nat = "", plan = "" }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "USD" };
  if (!catalogue) {
    return { ...answer, why: "the Kraken catalogue is not written yet: run `node brokers/kraken/kraken_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Kraken catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Kraken`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  if (isXstock(m.row)) {
    const asked = String(plan || "").trim().toLowerCase();
    const eea = asked ? asked === "eea" : EEA.includes(String(nat || "").trim().toUpperCase());
    // Dollars can sit on the account, so an EEA purchase in USD or USDG is 0
    // and no conversion is required. The 1 % is another currency.
    const leg = eea ? 0 : XSTOCK_TAKER;
    const listing = {
      isin: String(m.row.isin || "").toUpperCase() || null,
      ticker: m.row.ticker || null,
      name: m.row.name || null,
      type: m.row.type || null,
      mic: null,
      exchange: "xStock",
      currency: "USD",
      brokerExchange: m.row.exchange || null,
    };
    const shared = {
      ...answer,
      listing,
      // The EEA price can hide a spread Kraken does not print. Leaving bp
      // empty is what makes the total say "unknown spread".
      ...(eea ? {} : { bp: 0, perShare: 0 }),
      url: eea ? SCHEDULE.xstocksFaq : SCHEDULE.xstocks,
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer("USD") },
      fxIfConverted: 0,
      remark: eea
        ? "FX 1% when cash ≠ USD."
        : "Maker −0.02% is not this trip.",
    };
    const n = Number(shares);
    const p = Number(price);
    if (!(n > 0 && p > 0)) {
      return {
        ...shared,
        why: !(n > 0) ? "no share count" : "no price for this line: run node assets/prices.mjs",
      };
    }
    const notional = n * p;
    const notionalUsd = toUsd(notional, listing.currency);
    const brokerFees = notionalUsd == null ? null : notionalUsd * leg * 2;
    const one = notionalUsd == null ? null : notionalUsd * leg;
    return {
      ...shared,
      usd: eea ? null : finite(brokerFees, 6),
      brokerFees: finite(brokerFees, 6),
      trade: {
        shares: n,
        price: p,
        notional,
        notionalUsd: finite(notionalUsd, 6),
        currency: listing.currency,
      },
      buy: { fee: finite(one, 6) },
      sell: { fee: finite(one, 6) },
      parts: { market: eea ? null : 0, commission: finite(brokerFees, 6), regulatory: 0 },
      basis: eea
        ? `xStocks schedule, re-read ${SCHEDULE.readOn}: purchase in USD or USDG is 0, dollars can be held (page of ${SCHEDULE.xstocksAsOf})`
        : `Pro xStocks book, re-read ${SCHEDULE.readOn}: taker 0.10% a leg from $0 (page of ${SCHEDULE.xstocksAsOf})`,
      confidence: eea
        ? "USD or USDG purchase is 0; another currency or a conversion is 1% a leg and is not this trip; no FX; no book for the EEA"
        : `taker ${(XSTOCK_TAKER * 100).toFixed(2)}% a leg from $0 of volume; maker −0.02% is not this trip`,
    };
  }
  const crypto = isCrypto(m.row);
  const book = crypto
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "kraken",
        ticker: m.row.ticker,
      });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: crypto ? null : book.mic ?? m.venue?.mic ?? null,
    exchange: crypto ? "Crypto" : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketBp = crypto ? null : bp ?? leaf?.bp ?? null;
  const marketPerShare = crypto ? null : perShare ?? leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: crypto ? null : m.venue,
    unsourced: crypto ? m.unsourced || { match: ["crypto"] } : null,
    toUsd: (x) => toUsd(x, listing.currency),
  });

  const shared = {
    ...answer,
    listing,
    bp: crypto ? 0 : marketBp,
    perShare: marketPerShare,
    url: crypto ? SCHEDULE.tiers : SCHEDULE.equities,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    ...(crypto
      ? { remark: "Instant Buy and the volume tiers are a different price." }
      : {}),
  };

  const n = Number(shares);
  const p = Number(price);
  const a = Number(amount);
  if (crypto ? !(a > 0) && !(n > 0 && p > 0) : !(n > 0 && p > 0)) {
    return {
      ...shared,
      why: crypto
        ? "no amount for this coin"
        : !(n > 0)
          ? "no share count"
          : "no price for this line: run node assets/prices.mjs",
    };
  }

  const notional = crypto && a > 0 ? a : n * p;
  const notionalUsd = crypto && a > 0 ? a : toUsd(notional, listing.currency);
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * (crypto ? 0 : n);

  let brokerFees;
  let secUsd = 0;
  let tafUsd = 0;
  if (crypto) {
    brokerFees = notionalUsd == null ? null : notionalUsd * TAKER * 2;
  } else {
    brokerFees = 0;
    secUsd = notionalUsd == null ? null : secOf(notionalUsd);
    tafUsd = n > 0 ? tafOf(n) : null;
  }
  const usd = plus(bookUsd, brokerFees, secUsd, tafUsd);

  const basis = crypto
    ? `Kraken spot schedule, tier 1, re-read ${SCHEDULE.readOn}: taker ${(TAKER * 100).toFixed(2)}% a leg`
    : `Kraken Securities schedule, re-read ${SCHEDULE.readOn}: $0 commission, SEC and TAF on the sale`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `no book for ${m.unsourced?.name || listing.exchange}: ${m.unsourced?.why || "no book leaf"}` }
      : {}),
    trade: {
      shares: crypto && a > 0 ? null : n,
      price: crypto && a > 0 ? null : p,
      amount: crypto && a > 0 ? a : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: crypto && a > 0 ? "USD" : listing.currency,
    },
    buy: crypto ? { taker: finite(notionalUsd == null ? null : notionalUsd * TAKER, 6) } : { commission: 0 },
    sell: crypto
      ? { taker: finite(notionalUsd == null ? null : notionalUsd * TAKER, 6) }
      : { commission: 0, sec: finite(secUsd, 6), taf: finite(tafUsd, 6), tafCapped: TAF_PER_SHARE * n >= TAF_CAP },
    parts: {
      market: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      regulatory: crypto ? 0 : finite(plus(secUsd, tafUsd), 6),
    },
    basis,
    confidence: crypto
      ? `taker ${(TAKER * 100).toFixed(2)}% a leg, tier 1 of ${SCHEDULE.tiersAsOf}; maker ${((TAKER / 2) * 100).toFixed(2)}% is not this trip; no crypto book`
      : `commission 0; SEC $${SEC_PER_MILLION} per million, rounded up to the next cent; TAF $${TAF_PER_SHARE} a share, to the nearest cent, cap $${TAF_CAP} (page of ${SCHEDULE.equitiesAsOf})`,
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
          equity: { commission: 0, secPerMillion: SEC_PER_MILLION, tafPerShare: TAF_PER_SHARE, tafCap: TAF_CAP },
          crypto: { tier: 1, taker: TAKER, maker: TAKER / 2 },
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
    console.error(
      "usage: node brokers/kraken/kraken_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p] [--amount=usd]\n" +
        "       node brokers/kraken/kraken_cost.mjs --schedule"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!out.listing) {
    console.log(out.why || "nothing to say");
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}, ${l.currency}${l.type ? `, ${l.type}` : ""}\n`);
  console.log(`round trip : ${out.usd == null ? `N/A — ${out.why || ""}` : `${out.usd} $`}`);
  console.log(`broker fees: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  if (out.basis) console.log(`\n  ${out.basis}`);
  if (out.confidence) console.log(`  ${out.confidence}`);
  if (out.remark) console.log(`  · ${out.remark}`);
}
