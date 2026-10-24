// What one round trip costs at Union Securities (聯邦證券): buy n shares at
// price p on the Taiwan Stock Exchange, the Taipei Exchange or its Emerging
// Stock Board, sell them back at once, online, in dollars.
//
// FAQ read 2026-10-24 (六、費用、稅務與股利, 2. 股票交易手續費計算方式？):
//   "成交金額 x 千分之1.425元(整股交易者，不滿20元以20元計，零股則是最低1元起)，
//   若是電子交易或活動則會有額外的優惠，其優惠之金額會於交易日的隔月，以退款的
//   方式匯入其銀行交割帳號中。"
//   commission   0.1425 % each side; NT$20 floor on a round-lot order,
//                NT$1 on an odd-lot order (零股, under 1,000 shares, a
//                separate order). No rounding is printed: none is applied.
//   discount     the online discount is paid back the following month, and
//                no page prints its size (stock page, FAQ, notices, the
//                download and e-counter pages): the order is charged the
//                list rate, which is the total here; the refund is a remark.
// ETFs trade like shares (FAQ) and pay the same commission. The Emerging
// Stock Board (興櫃) is ordered on the same tariff: nothing on the site
// prints another one.
// Securities transaction tax on the sale, from ../banktaiwan/twTax.mjs:
// 0.3 % a share, 0.1 % an ETF, TDR or REIT, nil on a passive bond ETF until
// 2026-12-31, truncated. The 0.15 % day-trade rate is a remark on a listed
// share (the emerging board has no day trading).
//
// Cash is TWD (deposits.mjs), every line is in TWD: no FX. Margin, futures
// and funds stay out.
// Book: the exchange's own book (spreads/book.mjs, broker "unionsec"). The
// Emerging Stock Board is a negotiated market with market makers and no
// public book (spreads/venues.mjs): its lines are N/A on the book, with the
// broker fees still shown.
//
//   https://www.usot.com.tw/faq.htm
//   https://www.usot.com.tw/stock.htm
//
//   node brokers/unionsec/unionsec_cost.mjs 2330 "Taiwan Stock Exchange" TWD --shares=1000 --price=1000
//   node brokers/unionsec/unionsec_cost.mjs 0050 "Taiwan Stock Exchange" TWD --shares=200 --price=190
//   node brokers/unionsec/unionsec_cost.mjs 00679B "Taipei Exchange" TWD --shares=3000 --price=27
//   node brokers/unionsec/unionsec_cost.mjs 1260 "Taipei Exchange Emerging Stock Board" TWD --shares=1000 --price=40
//   node brokers/unionsec/unionsec_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { TAX, BOND_ETF_SUSPENDED_UNTIL, splitLots, saleTax, taxRate, dayTradeRemark } from "../banktaiwan/twTax.mjs";

const CATALOGUE = new URL("unionsec-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.usot.com.tw/faq.htm",
  stock: "https://www.usot.com.tw/stock.htm",
  readOn: "2026-10-24",
  entity: "Union Securities Co., Ltd. (聯邦證券)",
  channel: "online (電子交易), charged at the list rate, discount refunded the next month",
};

const CASH = "TWD";
// Each side, each order.
const FEE = { rate: 0.001425, min: 20, oddMin: 1 };
const EMERGING = "Taipei Exchange Emerging Stock Board";
const REFUND = "Fees might be lower: online discount refunded next month.";

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

// One side of the trip: a round-lot order (floor NT$20) and an odd-lot
// order (floor NT$1). No rounding is printed.
function commissionSide(n, price) {
  const { round, odd } = splitLots(n);
  const roundFee = round > 0 ? Math.max(FEE.min, round * price * FEE.rate) : 0;
  const oddFee = odd > 0 ? Math.max(FEE.oddMin, odd * price * FEE.rate) : 0;
  return roundFee + oddFee;
}

const BASIS = "0,1425 % (千分之1,425), plancher 20 TWD par ordre en lot entier, 1 TWD en lot impair ; remise électronique remboursée le mois suivant, montant non publié, hors du total";

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
    return { ...answer, why: "le catalogue Union Securities n'existe pas encore : lancer `node brokers/unionsec/unionsec_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Union Securities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Union Securities`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "unionsec",
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
    remark: REFUND,
    basis: `Union Securities, barème relu le ${SCHEDULE.readOn} : ${BASIS} ; ${tax.label}`,
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
  const emerging = m.row.exchange === EMERGING;
  const remark = [dayTradeRemark(m.row, n, emerging), REFUND].filter(Boolean).join("\n");
  const confidence = [
    shared.basis,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    emerging ? "Emerging Stock Board : marché négocié, pas de carnet public" : "",
    "caisse en TWD, pas de change",
  ].filter(Boolean).join(" ; ");

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
    console.error("usage : node brokers/unionsec/unionsec_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
