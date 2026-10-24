// What one round trip costs at BankTaiwan Securities (臺銀證券): buy n shares
// at price p on the Taiwan Stock Exchange or the Taipei Exchange, sell them
// back at once, online, in dollars.
//
// Business page read 2026-10-24 (二、費用與收入說明):
//   交易手續費  (1)–(5) 0.1425 % up to NT$10 million a month, 0.1325 %,
//               0.12 %, 0.11 %, 0.1 % above NT$150 million a month;
//               (6) "電子下單手續費 0.0498%".
//   註 1        "現場下單及電話下單依上列（1）～（5）每月每戶成交金額計算", with
//               the monthly difference refunded: the five tiers are the
//               counter and phone schedule. An online order pays (6).
//   註 3        "手續費每筆至少20元": NT$20 an order, each side.
//   註 4        "小數點以下，無條件捨去": the fee is truncated to the dollar.
// The FAQ (Q6) prints the list rate, 0.1425 %, with "電子下單優惠，請洽所屬
// 營業員" (online discount: ask your salesperson); the business page is the
// published online figure and is the one used.
// ETFs pay the same commission (FAQ Q24).
// Securities transaction tax on the sale, from ./twTax.mjs: 0.3 % a share,
// 0.1 % an ETF, TDR or REIT, nil on a passive bond ETF until 2026-12-31,
// truncated. The 0.15 % day-trade rate is a remark.
// Odd lots (零股, under 1,000 shares) are separate orders and pay the same
// NT$20 floor (the business page names no other floor).
// Altered-trading shares are bought through a salesperson (FAQ Q10) and
// are in the catalogue; their sale is online, the buy is not checked here.
//
// Cash is TWD only ("交割銀行僅限臺灣銀行新臺幣存款帳戶"), every line is in
// TWD: no FX. Custody, margin and securities lending stay out.
// Book: the exchange's own book (spreads/book.mjs, broker "banktaiwan").
//
//   https://www.twfhcsec.com.tw/Activity/BusinessIntro
//   https://www.twfhcsec.com.tw/Home/faq
//
//   node brokers/banktaiwan/banktaiwan_cost.mjs 2330 "Taiwan Stock Exchange" TWD --shares=1000 --price=1000
//   node brokers/banktaiwan/banktaiwan_cost.mjs 0050 "Taiwan Stock Exchange" TWD --shares=200 --price=190
//   node brokers/banktaiwan/banktaiwan_cost.mjs 00679B "Taipei Exchange" TWD --shares=3000 --price=27
//   node brokers/banktaiwan/banktaiwan_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { TAX, BOND_ETF_SUSPENDED_UNTIL, splitLots, saleTax, taxRate, dayTradeRemark } from "./twTax.mjs";

const CATALOGUE = new URL("banktaiwan-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.twfhcsec.com.tw/Activity/BusinessIntro",
  faq: "https://www.twfhcsec.com.tw/Home/faq",
  readOn: "2026-10-24",
  entity: "BankTaiwan Securities Co., Ltd. (臺銀綜合證券)",
  channel: "online (電子下單)",
};

const CASH = "TWD";
// Each side, each order.
const FEE = { rate: 0.000498, min: 20 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

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
      if (loose(m.row.exchange) === wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// One side of the trip: a round-lot order and an odd-lot order, each with
// its own floor, each truncated to the dollar.
function commissionSide(n, price) {
  const { round, odd } = splitLots(n);
  return [round, odd]
    .filter((q) => q > 0)
    .reduce((sum, q) => sum + Math.max(FEE.min, Math.floor(q * price * FEE.rate + 1e-9)), 0);
}

const BASIS = "électronique 0,0498 %, plancher 20 TWD par ordre, tronqué au dollar ; lot entier et lot impair, deux ordres";

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
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue BankTaiwan n'existe pas encore : lancer `node brokers/banktaiwan/banktaiwan_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BankTaiwan` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BankTaiwan`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "banktaiwan",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? (m.row.mic || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxRate(m.row);
  const shared = {
    ...answer,
    listing,
    basis: `BankTaiwan, barème relu le ${SCHEDULE.readOn} : ${BASIS} ; ${tax.label}`,
    tax: { known: true, buy: {}, sell: { TW_STT: tax.rate } },
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) return { ...shared, why: `${listing.currency} : le compte ne règle qu'en TWD` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, CASH);
  if (notionalUsd == null) return { ...shared, why: "pas de cours pour le TWD" };
  const side = commissionSide(n, p);
  const brokerLocal = side * 2;
  const taxLocal = saleTax(m.row, n, p);
  const brokerFees = dollars(brokerLocal, CASH);
  const taxUsd = dollars(taxLocal, CASH);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, CASH),
  });
  const bookUsd = parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const remark = dayTradeRemark(m.row, n);
  const confidence = [
    shared.basis,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    "caisse en TWD, pas de change",
  ].join(" ; ");

  return {
    ...shared,
    remark,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: CASH },
    commission: { buy: side, sell: side, currency: CASH },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      change: 0,
    },
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, fee: FEE, tax: TAX, bondEtfSuspendedUntil: BOND_ETF_SUSPENDED_UNTIL, cash: CASH, basis: BASIS }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/banktaiwan/banktaiwan_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: Number(flag("shares") ?? "1000"),
    price: Number(flag("price") ?? "0"),
  }), null, 2));
}

printCli();
