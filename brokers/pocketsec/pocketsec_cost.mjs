// What one round trip costs at Pocket Securities (口袋證券, Taiwan's online-
// only broker): buy n shares at price p, sell them back at once, in dollars.
// Every order is electronic (電子下單). Regular-savings orders (存股), manual
// orders and margin stay out.
//
// FAQ "台股及美股交易手續費率是多少？" read 2026-10-26:
//   Taiwan (TWSE, TPEx)  "電子下單享 2.8 折，單筆最低收取1元，(計算方式：成交
//                        金額 × 0.1425% × 0.28)", until 2026-12-31: 0.0399 %
//                        an order, minimum 1 TWD. A round lot and an odd lot
//                        (零股, under 1,000 shares) are separate orders, each
//                        with its own minimum. No rounding is printed: none
//                        is applied.
//   United States        "美股新開戶可享電子單手續費 0.08% 無低消", until
//   (複委託)              2026-12-31: 0.08 % an order, no minimum. (The
//                        school article's standing schedule is 0.12 %, min
//                        3 USD; the FAQ's current offer is the one used.)
//                        No US charge (SEC fee) is printed: none is added.
// Securities transaction tax on a Taiwan sale, from ../banktaiwan/twTax.mjs:
// 0.3 % a share, 0.1 % an ETF, TDR or REIT, nil on a passive bond ETF until
// 2026-12-31, truncated, once per sale order. The 0.15 % day-trade rate is
// the remark "Same day sell tax is x% lower." on an ordinary share.
//
// Cash: TWD (口袋錢包) and USD (deposits.mjs: US orders settle in TWD or in
// the client's dollar account). So a US line has no conversion in the
// number. TWD settlement converts at CTBC Bank's spot board (中國信託即期
// 匯率, school articles 3276 and 3294); the remark is half the bank's USD
// spot bid-ask, read from the board in ../ctbc/ctbc_cost.mjs
// (2026/10/05: 31.762 / 31.962).
//
// Book: Taiwan, the exchange's own book; US orders, no US broker-dealer is
// named, so the quoted NBBO of the ticker (no Rule 606 mix).
//
//   https://www.pocket.tw/main/faq/legacy-124
//   https://www.pocket.tw/school/articles/3276/
//   https://www.pocket.tw/school/articles/3294/
//   https://www.ctbcbank.com/twrbo/zh_tw/dep_index/dep_ratequery/dep_foreign_rates.html
//
//   node brokers/pocketsec/pocketsec_cost.mjs 2330 "Taiwan Stock Exchange" TWD --shares=1000 --price=1000
//   node brokers/pocketsec/pocketsec_cost.mjs 0050 "Taiwan Stock Exchange" TWD --shares=15 --price=190
//   node brokers/pocketsec/pocketsec_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/pocketsec/pocketsec_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { splitLots, saleTax, taxRate, dayTradeRemark } from "../banktaiwan/twTax.mjs";

const CATALOGUE = new URL("pocketsec-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.pocket.tw/main/faq/legacy-124",
  settlement: "https://www.pocket.tw/school/articles/3276/",
  board: "https://www.ctbcbank.com/twrbo/zh_tw/dep_index/dep_ratequery/dep_foreign_rates.html",
  readOn: "2026-10-26",
  offerUntil: "2026-12-31",
  boardOn: "2026-10-05",
  entity: "口袋證券 Pocket Securities",
};

const TW = { rate: 0.001425 * 0.28, min: 1 };
const US = { rate: 0.0008 };
// CTBC spot board, USD/TWD bid and ask.
const BOARD_USD = [31.762, 31.962];

const TAIWAN_MICS = new Set(["XTAI", "ROCO"]);
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE", "IEXG"]);

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
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (loose(m.row.exchange) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// One side in Taiwan: a round-lot order and an odd-lot order, each with its
// own 1-dollar minimum.
function taiwanSide(n, price) {
  const { round, odd } = splitLots(n);
  return [round, odd].filter((q) => q > 0).reduce((sum, q) => sum + Math.max(TW.min, q * price * TW.rate), 0);
}

function fxRemarkUsd() {
  const [bid, ask] = BOARD_USD;
  const gap = ((ask - bid) / (ask + bid)) * 100;
  return `FX ${Number(gap.toFixed(2))}% when cash ≠ USD.`;
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
    cashCurrency: "TWD",
    remark: "",
    url: SCHEDULE.url,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Pocket n'existe pas encore : lancer `node brokers/pocketsec/pocketsec_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Pocket` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Pocket`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "pocketsec",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? (m.row.mic || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const mic = code(m.row.mic || listing.mic);
  const taiwan = TAIWAN_MICS.has(mic) && listing.currency === "TWD";
  const american = US_MICS.has(mic) && listing.currency === "USD";
  if (!taiwan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} ${listing.currency} n'a pas de ligne dans le barème Pocket` };
  }

  const tax = taiwan ? { known: true, buy: {}, sell: { TW_STT: taxRate(m.row).rate } } : taxesOf(listing.isin);
  const taxTotal = taiwan ? 0 : Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const basis = taiwan
    ? `barème Pocket, relu le ${SCHEDULE.readOn} : électronique 0,1425 % × 0,28 = 0,0399 % par ordre, min 1 TWD, jusqu'au ${SCHEDULE.offerUntil} ; lot entier et lot impair, deux ordres ; ${taxRate(m.row).label}`
    : `barème US Pocket, relu le ${SCHEDULE.readOn} : électronique 0,08 % par ordre, sans minimum, nouveaux comptes jusqu'au ${SCHEDULE.offerUntil} ; aucun frais US imprimé`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: american ? fxRemarkUsd() : "",
    url: american ? SCHEDULE.url : SCHEDULE.url,
    basis,
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
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american) {
    const quoted = usBookPerShare({ broker: "pocketsec", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;

  const side = taiwan ? taiwanSide(n, p) : notional * US.rate;
  const commissionUsd = dollars(side * 2, listing.currency);
  const taxUsd = taiwan ? dollars(saleTax(m.row, n, p), "TWD") : notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const remark = taiwan ? dayTradeRemark(m.row, n) : shared.remark;
  const confidence = [
    basis,
    taiwan ? "ligne en TWD : pas de change" : "change hors du chiffre (dollar en dépôt)",
    american ? "aucun courtier US nommé : NBBO coté" : "",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    remark,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: taiwan
      ? { rate: TW.rate, min: TW.min, buy: side, sell: side, currency: "TWD" }
      : { rate: US.rate, perOrder: side, currency: "USD", eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
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
    console.log(JSON.stringify({ ...SCHEDULE, taiwan: TW, us: US, boardUsd: BOARD_USD, cash: ["TWD", "USD"] }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/pocketsec/pocketsec_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
