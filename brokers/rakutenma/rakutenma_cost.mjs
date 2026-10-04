// What one round trip costs at Rakuten Trade: buy n shares, sell them
// back at once, in dollars. Online order. Bursa, the United States and
// Hong Kong.
//
// https://www.rakutentrade.my/fees
// https://www.rakutentrade.my/faqs/charges-and-fees
// read on 2026-10-02.
//   Bursa brokerage          below RM100: RM1
//                            RM100 to RM9,999.99: RM2.88
//                            RM10,000 to RM99,999.99: 0.10%
//                            RM100,000 and above: RM100
//                            plus 0.01% of the trade once it reaches RM1 million
//   Bursa clearing           0.03%, max RM1,000 a contract
//   Bursa SST                8% of brokerage and of clearing, REIT and ETF only
//   Bursa stamp              RM1 per RM1,000 or part, max RM1,000.
//                            REIT max RM200. ETF exempt through 31 Dec 2028.
//   US brokerage             0.10%, min 0.88 USD, max 25 USD
//   US stock under 1 USD     extra 1% of the trade
//   US SEC                   0.0000206 of the sale, min 0.01 USD
//   US FINRA                 0 from 1 Oct 2026 through 31 Dec 2026
//   US CAT                   0.000003 a share, min 0.01 USD, each side
//   HK brokerage             0.10%, min 35 HKD
//   HK exchange              trading 0.00565%, settlement 0.0042%,
//                            SFC 0.0027% min 0.01 HKD, AFRC 0.00015% min 0.01 HKD
//   HK stamp                 0.1%, rounded up to the next HKD. Not on an ETF.
//   Malaysian stamp          RM1 per RM1,000 or part of the contract in
//                            ringgit, on a US or HK trade too. Max RM1,000,
//                            or RM200 on an ETF.
//   United States            Rule 605 times Interactive Brokers LLC's 606.
//                            The foreign-equity FAQ names that partner.
//   Hong Kong, Bursa         no book is published here
//   ADR fee                  a range, so it stays out
//   Assisted RM30, margin and same-day amalgamation stay out.
//   Cash in MYR, USD or HKD is held with no printed conversion charge.
//
//   node brokers/rakutenma/rakutenma_cost.mjs MAYBANK Bursa MYR --shares=10 --price=10
//   node brokers/rakutenma/rakutenma_cost.mjs AAPL US USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("rakutenma-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);
const PAGE = "https://www.rakutentrade.my/fees";
const READ_ON = "2026-10-02";
const SST = 0.08;
const PARTNER = "https://www.rakutentrade.my/faqs/trading-foreign-equity/does-rakuten-trade-with-business-partner-interactive-brokers-ibkr-have-the-right-to-dispose-shares-without-my-consent";

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
const ringgit = (amount, currency) => {
  const usd = dollars(amount, currency);
  const per = usdPer("MYR");
  return usd == null || !(per > 0) ? null : usd / per;
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

function marketOf(exchange) {
  const name = loose(exchange);
  if (name === "BURSA") return "bursa";
  if (name === "US") return "us";
  if (name === "HONGKONG") return "hk";
  return "";
}

function fundLike(type) {
  return type === "ETF" || type === "ETN" || type === "ETC";
}

function sstAsset(type) {
  return type === "REIT" || fundLike(type);
}

function bursaBrokerage(notional) {
  let fee;
  if (notional < 100) fee = 1;
  else if (notional < 10000) fee = 2.88;
  else if (notional < 100000) fee = notional * 0.001;
  else fee = 100;
  if (notional >= 1_000_000) fee += notional * 0.0001;
  return fee;
}

// RM1 for every RM1,000 or part of it.
function stampRinggit(notionalMyr, cap) {
  if (!(cap > 0) || !(notionalMyr > 0)) return 0;
  return Math.min(cap, Math.ceil(notionalMyr / 1000 - 1e-9));
}

function ticketUsd({ market, type, notional, shares, price }) {
  const parts = [];
  const add = (amount, currency) => parts.push(dollars(amount, currency));
  if (market === "bursa") {
    const brokerage = bursaBrokerage(notional);
    const clearing = Math.min(notional * 0.0003, 1000);
    const tax = sstAsset(type) ? SST : 0;
    const cap = fundLike(type) ? 0 : type === "REIT" ? 200 : 1000;
    add((brokerage + clearing) * (1 + tax) * 2, "MYR");
    add(stampRinggit(notional, cap) * 2, "MYR");
  } else if (market === "us") {
    const brokerage = Math.min(25, Math.max(0.88, notional * 0.001));
    const penny = type === "STOCK" && price < 1 ? notional * 0.01 : 0;
    const sec = Math.max(0.01, notional * 0.0000206);
    const cat = Math.max(0.01, shares * 0.000003);
    const myr = ringgit(notional, "USD");
    if (myr == null) return null;
    add((brokerage + penny + cat) * 2 + sec, "USD");
    add(stampRinggit(myr, fundLike(type) ? 200 : 1000) * 2, "MYR");
  } else if (market === "hk") {
    const brokerage = Math.max(35, notional * 0.001);
    const trading = notional * 0.0000565;
    const settlement = notional * 0.000042;
    const sfc = Math.max(0.01, notional * 0.000027);
    const afrc = Math.max(0.01, notional * 0.0000015);
    const duty = fundLike(type) ? 0 : Math.ceil(notional * 0.001 - 1e-9);
    const myr = ringgit(notional, "HKD");
    if (myr == null) return null;
    add((brokerage + trading + settlement + sfc + afrc + duty) * 2, "HKD");
    add(stampRinggit(myr, fundLike(type) ? 200 : 1000) * 2, "MYR");
  } else return null;
  if (parts.some((part) => part == null)) return null;
  return parts.reduce((sum, part) => sum + part, 0);
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
    cashCurrency: "",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Rakuten Trade n'existe pas encore : lancer `node brokers/rakutenma/rakutenma_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Rakuten Trade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Rakuten Trade`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "rakutenma",
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
  const market = marketOf(listing.brokerExchange);
  const american = market === "us";
  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (american && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: "rakutenma", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const tax = taxesOf(listing.isin);
  const rates = { ...taxRates(tax) };
  for (const name of Object.keys(rates)) {
    if (/STAMP|FTT|DUTY/i.test(name)) delete rates[name];
  }
  const taxTotal = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    basis:
      `page des frais relue le ${READ_ON}. ` +
      `Bourse malaisienne : courtage par palier, compensation 0,03 %, timbre, et SST 8 % sur un REIT ou un ETF. ` +
      `États-Unis : 0,10 % (0,88 à 25 USD) plus SEC, CAT et timbre malaisien ; le carnet est celui d'Interactive Brokers. ` +
      `Hong Kong : 0,10 % (min 35 HKD) plus les frais de place et les deux timbres.`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
    url: american ? PARTNER : PAGE,
  };
  if (!market) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const brokerFees = ticketUsd({ market, type: listing.type, notional, shares: n, price: p });
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { market, currency: listing.currency },
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
