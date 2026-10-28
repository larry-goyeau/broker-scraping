// What one round trip costs at Lemonn (NU Investors Technologies, the
// CoinSwitch share broker): buy n shares, sell them back, equity delivery,
// online, in dollars. NSE and BSE, rupees only.
//
// https://lemonn.co.in/open-delivery-trading-account read on 2026-10-21.
//   Delivery brokerage          "₹20 or 0.05% of order value (Whichever
//                               is Lower)", each executed order. Intraday
//                               prints the same line.
//   Other Lemonn texts print ₹20 per executed order with only the SEBI
//   2.5% ceiling (tariff sheet, the brokerage waiver terms of 30 June 2026,
//   the brokerage calculator). They agree from ₹40,000 an order; below
//   that the delivery page, the one priced for this product, is followed.
// https://webdocs-ie.lemonn.co.in/new_tariff.png (the "Tariff sheet" of
// https://lemonn.co.in/stocks/regulatory-information), read on 2026-10-21,
// file dated 30 May 2025.
//   DP on a delivery sell       ₹13.5 + GST per scrip ("DP transaction
//                               charges - Market - Sell (Debit)")
//   Account maintenance         zero for lifetime
// https://lemonn.co.in/calculators/brokerage-calculator read on 2026-10-21
// (Lemonn's own delivery rates):
//   STT                         0.1% on the buy and on the sell
//   Stamp                       0.015% on the buy
//   Transaction                 NSE 0.00297% of turnover
//   SEBI                        0.0001% of turnover (₹10 / crore)
//   IPFT                        0.0001% of turnover
//   GST                         18% of brokerage + transaction + SEBI + IPFT
//                               (and of the DP debit, tariff sheet)
// The calculator puts the NSE rate on the BSE too and says to check the
// exchange. The BSE's own table by scrip group is used (bseindia.com
// static/members/TFEquity.aspx, notice 20221109-7, as in
// brokers/upstox/upstox_cost.mjs), per crore of turnover:
//   A, B ₹375; M, MT, TS, MS, IF, IT, R ₹275; X, XT, Z ₹10,000; P, ZP ₹1,00,000.
// The group is the token before the ISIN on the catalogue line. A BSE line
// with no group (a name whose home page is the NSE) or group T answers
// with a `why`.
// STT on an ETF is the law's (Finance Act, as in ibkrin): an
// equity-oriented fund pays 0.001% on the sell only; a gold, silver, debt,
// liquid or foreign-index ETF pays none.
//
// In the total: the book, brokerage, DP, STT, stamp, exchange, SEBI, IPFT
// and GST. Remark on a share, at this order's value: "Same day sell fees are x%
// lower." (an intraday buy and sell: same brokerage, STT 0.025% on the
// sell only, stamp 0.003%, no DP debit). Cash is rupees only (deposits.mjs)
// and every line is INR: no FX. Not here: Call and
// Trade (₹50 per ISIN, phone), the Infinity Plan (₹99 for 30 days of zero
// brokerage, only for clients Lemonn emails), the new-client brokerage
// waiver, payment gateway ₹15 + GST on a pay-in. A REIT, an InvIT or a
// partly paid line is not the equity table: N/A.
//
//   node brokers/lemonn/lemonn_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/lemonn/lemonn_cost.mjs 7NR BSE INR --shares=100 --price=12
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, intradayBuySell, printCli, pct, sebiRate } from "../../indianDelivery.mjs";
import fs from "node:fs";

const CRORE = 1e7;
const PAGE = "https://lemonn.co.in/open-delivery-trading-account";
const READ_ON = "2026-10-21";

// BSE per crore of gross turnover, by scrip group (see the header).
const BSE_PER_CRORE = {
  A: 375, B: 375,
  M: 275, MT: 275, TS: 275, MS: 275, IF: 275, IT: 275, R: 275,
  X: 10000, XT: 10000, Z: 10000,
  P: 100000, ZP: 100000,
};

// "… BSE <group> <ISIN> <TYPE>" on a BSE catalogue line.
function bseGroup(row) {
  const hit = String(row?.raw || "").match(/\bBSE\s+([A-Z]{1,2})\s+IN[A-Z0-9]{10}\b/);
  return hit ? hit[1] : null;
}

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00297");
  if (exchange !== "BSE") return null;
  const perCrore = BSE_PER_CRORE[bseGroup(row)];
  return perCrore == null ? null : perCrore / CRORE;
}

function brokerageEach(notional) {
  return Math.min(20, notional * pct("0.05"));
}

// An ETF that is not an equity-oriented fund pays no STT.
const NON_EQUITY_FUND =
  /GOLD|SILVER|SILVR|LIQUID|LIQUI|\bLIQ\b|GILT|\bGLT\b|GSEC|G-SEC|SDL|BOND|BHARAT BOND|1D RAT|OVERNIGHT|MONEY MARKET|TBILL|NASDAQ|NASDQ|NAS100|MON100|N100|FANG|S&P 500|SP500|HANG SENG|HNGSNG|NYSE|MAHKTECH|MASPTOP50|US TECH|GLOBAL|INTERNATIONAL/i;

// Sides of 0.1% STT: a share pays both; an equity fund 0.001% on the sell.
function sttSides(row) {
  if (String(row?.type || "").toUpperCase() !== "ETF") return 2;
  if (NON_EQUITY_FUND.test(`${row?.name || ""} ${row?.ticker || ""}`)) return 0;
  return 0.01;
}

const SCHEDULE = {
  broker: "Lemonn",
  folder: "lemonn",
  catalogueUrl: new URL("lemonn-parsed.json", import.meta.url),
  url: PAGE,
  readOn: READ_ON,
  brokerageEach,
  txnRate,
  sttRate: pct("0.1"),
  sttSides,
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: pct("0.0001"),
  dpInr: 13.5,
  basis:
    "Courtage livraison : le plus bas de 20 ₹ et 0,05 % par ordre exécuté. DP 13,50 ₹ + GST par titre à la vente (grille tarifaire). " +
    "Transaction NSE 0,00297 %, IPFT 0,0001 % (calculateur Lemonn). BSE : barème de la BSE par groupe (A, B 0,00375 % ; M, MT, TS, MS, IF 0,00275 % ; X, XT, Z 0,1 % ; P, ZP 1 %). " +
    "STT d'un ETF : 0,001 % à la vente pour un fonds actions, 0 pour or, argent, dette, liquidités ou indice étranger.",
  remark: "",
};

export function roundTrip(query) {
  const cost = indiaRoundTrip(SCHEDULE, query);
  if (cost.listing && cost.listing.brokerExchange === "BSE" && cost.why && /taux de transaction/.test(cost.why)) {
    const group = bseGroup({ raw: findRaw(cost.listing) });
    return {
      ...cost,
      why: group
        ? `groupe BSE ${group} : pas de taux de transaction publié par la BSE pour ce groupe`
        : "ligne BSE sans groupe de cotation dans le catalogue Lemonn : frais de transaction BSE inconnus",
    };
  }
  // The same-day gap is a share's (an ETF's STT is another rule).
  if (cost.listing?.type !== "STOCK") return cost;
  const out = intradayBuySell(cost, SCHEDULE, brokerageEach);
  return { ...out, remark: String(out.remark || "").replace(/^Intraday buy and sell fees are /, "Same day sell fees are ") };
}

// The catalogue line behind a listing, for its BSE group.
let rawByKey = null;
function findRaw(listing) {
  if (!rawByKey) {
    rawByKey = new Map();
    try {
      const rows = JSON.parse(fs.readFileSync(SCHEDULE.catalogueUrl, "utf8"));
      for (const r of Array.isArray(rows) ? rows : rows?.rows || []) rawByKey.set(`${r.exchange}|${r.isin || r.ticker}`, r.raw);
    } catch {
      // no catalogue: indiaRoundTrip already says so
    }
  }
  return rawByKey.get(`${listing.brokerExchange}|${listing.isin || listing.ticker}`) || "";
}

printCli(import.meta.url, roundTrip);
