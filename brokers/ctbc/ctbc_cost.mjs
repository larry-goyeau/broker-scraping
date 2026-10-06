// What one round trip costs at CTBC Bank: buy n shares, sell
// them back, in dollars. Online order, one fill.
//
// https://www.ctbcbank.com/twrbo/zh_tw/inv_index/inv_etf/inv_ETF_int_transaction_notice.html
// read on 2026-10-05. The fee tab prices a domestic ETF apart from
// a foreign ETF, share or REIT.
//   Foreign, each side        1.5% of the fill. The broker's own
//                             commission is inside that rate.
//   Floor, each side          US USD 20, London USD 60, Hong Kong
//                             HKD 150 or RMB 120, Tokyo JPY 5,000.
//                             Shanghai has none printed. A regular
//                             share plan at USD 3 is another order.
//   A sell whose proceeds do
//   not cover the fee         the shortfall is waived.
//   On a sale the bank names
//   the local tax and not the
//   rate. The number uses the
//   rate the place prints.
//     United States           SEC 0.00206% of the sale, $20.60 per
//                             million, from 2026-04-04.
//                             https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2
//     Hong Kong, each side    stamp 0.1% on a share. An ETF transfer
//                             pays no stamp. SFC 0.0027%, AFRC
//                             0.00015%, trading fee 0.00565%.
//                             https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-(Hong-Kong)/Trading/Transaction?sc_lang=en
//     Shanghai                stamp 0.05% of the sale. The statute
//                             is 0.1%, halved from 2023-08-28.
//                             https://szs.mof.gov.cn/zhengcefabu/202308/t20230827_3904226.htm
//     Tokyo and London        no securities transaction tax to add.
//                             London here is ETFs.
//   Domestic ETF              1% of the principal on the buy. The
//                             broker's commission, 0.1425% a side,
//                             is inside that 1%. The sale pays a
//                             securities transaction tax of 0.1%.
//   Custody                   0.2% a year, taken on the sale. The
//                             days are not an input, so it stays
//                             out of the number. The NT$50 and
//                             NT$200 floors are the regular-savings
//                             plan, not this order.
//   A domestic ETF fills on
//   the next Taiwan session,
//   so the exchange book is
//   not used.
//   United States             the quoted NBBO of the ticker. The
//                             notice says 上手券商 and does not name
//                             the dealer, so no Rule 606 mix is
//                             applied.
//   The public spot board versus the Taiwan dollar is a bank bid
//   and a bank ask on the spot line, not the cash line. The remark
//   is half that spread, as "FX 0.314% when cash ≠ USD".
//   The board's own quote time is 2026/10/05 06:23:04.
//   Renminbi is one line, printed as CNY.
//   https://www.ctbcbank.com/twrbo/zh_tw/dep_index/dep_ratequery/dep_foreign_rates.html
//
//   node brokers/ctbc/ctbc_cost.mjs AAPL NYSE USD --shares=10 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("ctbc-parsed.json", import.meta.url);
const PAGE = "https://www.ctbcbank.com/twrbo/zh_tw/inv_index/inv_etf/inv_ETF_int_transaction_notice.html";
const READ_ON = "2026-10-05";
const FOREIGN = 0.015;
const DOMESTIC_BUY = 0.01;
const SALE_TAX = 0.001;
const SEC_RATE = 0.0000206;
const HK_LEVY = 0.000027 + 0.0000015 + 0.0000565;
const HK_STAMP = 0.001;
const SH_STAMP = 0.0005;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const CUSTODY = "Custody is 0.2% a year.";
const DOMESTIC = [
  "Sale tax is 0.1%.",
  CUSTODY,
  "The fill is a price in the next session.",
].join("\n");
// Spot bid and ask versus the Taiwan dollar, bank buy then bank sell.
// Half the pair's spread, over the mid, is how far the ask sits above
// the middle. Renminbi is one line, printed as CNY.
const BOARD = {
  USD: [31.762, 31.962],
  HKD: [4.004, 4.119],
  CNY: [4.7155, 4.789],
  JPY: [0.1989, 0.2049],
};

function floorOf(exchange, currency) {
  const place = loose(exchange);
  const coin = code(currency);
  if (place === "NYSE" || place === "NASDAQ") return 20;
  if (place === "LONDON") return 60;
  if (place === "HONGKONG" && coin === "HKD") return 150;
  if (place === "HONGKONG" && coin === "CNY") return 120;
  if (place === "TOKYO") return 5000;
  return null;
}

function ticket(notional, rate, floor) {
  const percent = notional * rate;
  if (!(floor > 0)) return percent;
  return Math.max(percent, floor);
}

function marketCharge(exchange, type, notional) {
  const place = loose(exchange);
  if (place === "NYSE" || place === "NASDAQ") return { buy: 0, sell: notional * SEC_RATE };
  if (place === "HONGKONG") {
    const stamp = String(type || "").toUpperCase() === "ETF" ? 0 : notional * HK_STAMP;
    const levy = notional * HK_LEVY;
    return { buy: stamp + levy, sell: stamp + levy };
  }
  if (place === "SHANGHAI") return { buy: 0, sell: notional * SH_STAMP };
  return { buy: 0, sell: 0 };
}

function remarkOf(currency, row, domestic) {
  const lines = domestic ? [DOMESTIC] : [CUSTODY];
  const pair = domestic ? null : BOARD[code(currency)];
  if (pair) {
    const [bid, ask] = pair;
    const gap = ((ask - bid) / (ask + bid)) * 100;
    lines.push(`FX ${gap.toFixed(3)}% when cash ≠ ${code(currency)}.`);
  }
  if (String(row?.raw || "").trim().endsWith("professional")) lines.push("For professional investors only.");
  return lines.join("\n");
}

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
    cashCurrency: "",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue CTBC n'existe pas encore : lancer `node brokers/ctbc/ctbc_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue CTBC` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez CTBC`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const domestic = loose(m.row.exchange) === "TWSE";
  const book = domestic
    ? { mic: null, leaf: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
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
  const american = !domestic && (loose(listing.brokerExchange) === "NYSE" || loose(listing.brokerExchange) === "NASDAQ") && listing.currency === "USD";
  const floor = domestic ? null : floorOf(listing.brokerExchange, listing.currency);
  const quoted = american ? usBookPerShare({ broker: "ctbc", ticker: listing.ticker }) : null;
  const marketBp = domestic ? null : bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = domestic ? null : perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: remarkOf(listing.currency, m.row, domestic),
    basis: domestic
      ? `ETF domestique, page relue le ${READ_ON}. Achat 1 %. La commission du courtier est incluse. Taxe de transaction 0,1 % de la vente. La garde est hors du nombre. Le cours est un prix de la séance suivante.`
      : `livraison en ligne, page relue le ${READ_ON}. Achat 1,5 %. Vente 1,5 %. Plancher 20 USD aux États-Unis, 60 USD à Londres, 150 HKD ou 120 RMB à Hong Kong, 5 000 JPY à Tokyo. La commission du courtier est incluse. SEC 0,00206 % de la vente. Hong Kong : stamp 0,1 % de chaque côté sur une action, aucun sur un ETF, plus SFC, AFRC et trading fee de chaque côté. Shanghai : 0,05 % de la vente.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buy = domestic ? notional * DOMESTIC_BUY : ticket(notional, FOREIGN, floor);
  const sell = domestic ? 0 : Math.min(ticket(notional, FOREIGN, floor), notional);
  const local = domestic
    ? { buy: 0, sell: notional * SALE_TAX }
    : marketCharge(listing.brokerExchange, listing.type, notional);
  const brokerFees = dollars(buy + sell, listing.currency);
  const levyUsd = dollars(local.buy + local.sell, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: domestic ? { why: "le cours est un prix de la séance suivante" } : m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levyUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(domestic
      ? { why: "le cours est un prix de la séance suivante" }
      : bookUsd == null
        ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
        : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: domestic ? DOMESTIC_BUY : FOREIGN,
      sell: domestic ? null : FOREIGN,
      floor,
      currency: listing.currency,
    },
    local: { buy: local.buy, sell: local.sell, currency: listing.currency },
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
