// What one round trip costs at Prime Transaction: buy n shares at
// price p, sell them back at once, in dollars. Arena XT. A phone,
// email or branch order stays out. A managed Flexible account stays
// out.
//
// The commission page, read on 2026-10-05. Online, the band follows
// the average monthly turnover of the last finished quarter:
//   above 700,000 lei     0.39%
//   100,000 to 700,000    0.50%
//   50,000 to 100,000     0.60%
//   below 50,000          0.80%
// The first deposit is treated as that turnover. Nothing here has a
// quarter on file, so the first band is the one below 50,000 lei.
// The other bands are turnover the page does not have. The remark
// shows how far each one sits below the 0.80% in the figure. There
// is no lei floor on this platform.
//
// An intraday pair is a buy and a sell of the same number of shares
// of the same issuer on the same day. The page prices that pair at
// 0.25% whatever the turnover, and credits the difference by the
// settlement day. The figure uses the first band for a share too.
// The same-day credit is 0.80% down to 0.25%, so −0.55% per
// execution, and that credit stays in the remark. The sentence says
// shares. An ETF has no such credit.
//
// Each executed order, partial or whole, adds 1 leu, or 1 euro when
// the trade is in euro. The ASF levy is printed as zero and is already
// inside the commission. VAT is named on the other charges, not on
// this commission. Account maintenance is not this order.
//
//   https://primet.ro/comisioane
//
//   node brokers/prime/prime_cost.mjs TLV BVB RON --shares=10 --price=100
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("prime-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);
const PAGE = "https://primet.ro/comisioane";
const READ_ON = "2026-10-05";
const INTRADAY = 0.0025;
const FIRST_BAND = 0.008;
const ORDER = { RON: 1, EUR: 1 };
const SAME_DAY = `-${((FIRST_BAND - INTRADAY) * 100).toFixed(2)}%`;
const gap = (rate) => `-${((FIRST_BAND - rate) * 100).toFixed(2)}%`;
const VOLUME_ABOVE =
  `Above 50,000 lei of average monthly turnover in the last finished quarter: ${gap(0.006)} up to 100,000, ${gap(0.005)} up to 700,000, ${gap(0.0039)} above 700,000`;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

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

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "RON",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "the Prime catalogue is not there yet: run `node brokers/prime/prime_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Prime catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Prime`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "prime",
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
  const share = listing.type !== "ETF";
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency || "RON",
    remark: share
      ? `If the sale is the same day: ${SAME_DAY} per execution. ${VOLUME_ABOVE}.`
      : `${VOLUME_ABOVE}.`,
    basis: share
      ? `Prime Transaction online, schedule re-read on ${READ_ON}. Share, first band, turnover unknown: 0.80% per execution and 1 leu per order.`
      : `Prime Transaction online, schedule re-read on ${READ_ON}. ETF, first band, turnover unknown: 0.80% per execution and 1 leu per order.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "no share count" };
  if (!(p > 0)) return { ...shared, why: "no price for this line: run node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const orderFee = ORDER[listing.currency];
  const rate = FIRST_BAND;
  const local = orderFee == null ? null : notional * rate * 2 + orderFee * 2;
  const brokerFees = local == null ? null : dollars(local, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);
  const bookWhy = bookUsd == null ? `no book for ${listing.exchange}: ${m.unsourced?.why || "no book sheet"}` : "";

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookWhy ? { why: bookWhy } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate, order: orderFee, currency: listing.currency },
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
