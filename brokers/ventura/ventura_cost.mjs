// What one round trip costs at Ventura Securities: buy n shares, sell them
// back, equity delivery, online, in dollars. NSE and BSE, rupees only.
//
// https://www.venturasecurities.com/exclusive-pricing-plan/ read on
// 2026-10-24 (https://www.venturasecurities.com/pricing/ redirects to it;
// it is the only price list the site publishes).
//   Equity delivery / intraday  "₹9 per order or 0.05% whichever is lower",
//                               + GST. The ₹20 crossed out beside it is the
//                               "standard pricing"; no table is printed for
//                               it, so it is not a row.
//   DP on a delivery sell       ₹20 + GST per scrip ("For stocks sold")
//   Account opening, AMC        ₹0
//   GST                         18% on brokerage, SEBI charges, clearing,
//                               DP charges and transaction charges
//   SEBI                        0.0001% of turnover (₹10 per crore)
//   STT, transaction, stamp     named, no rate printed: the law's and the
//                               exchanges' own schedules below.
// Ventura's brokerage calculator
// (https://www.venturasecurities.com/brokerage-calculator/, same day) is
// out of date and not used: flat ₹9 with no 0.05% branch, DP ₹15 + GST,
// NSE 0.00322% + 0.0001%, no GST on the DP.
//
// Statutory lines.
//   STT                         0.1% on the buy and on the sell (Finance Act;
//                               the pricing page says "both buy and sell
//                               sides for equity delivery"). An ETF that is
//                               an equity-oriented fund pays 0.001% on the
//                               sell only; a gold, silver, debt, liquid or
//                               foreign-index ETF pays none (as in
//                               brokers/lemonn).
//   Stamp                       0.015% on the buy (Indian Stamp Act rates
//                               for delivery, 2020 notification)
//   NSE transaction             ₹306.99 per crore each side, plus the NSE
//                               IPFT contribution ₹0.01 per crore each side,
//                               from 1 March 2026: NSE circular NSE/FA/73061
//                               of 27 February 2026,
//                               https://nsearchives.nseindia.com/content/circulars/FA73061.pdf
//                               read on 2026-10-24.
//   BSE transaction             by scrip group, the BSE's own table
//                               (bseindia.com/static/members/TFEquity.aspx,
//                               notice 20221109-7; it answers 403 to a plain
//                               request on 2026-10-24, so the figures are the
//                               ones brokers/upstox read there on 2026-10-18),
//                               per crore of gross turnover:
//                                 A, B                        ₹375
//                                 E F FC G GC I W             ₹375, or ₹275
//                                   if the scrip is BSE-exclusive (no NSE
//                                   line in the Ventura catalogue)
//                                 M, MT, TS, MS, IF, IT, R    ₹275
//                                 X, XT, Z (XC, XD merged)    ₹10,000
//                                 P, ZP, SS, ST               ₹1,00,000
//                               Group T is not in the table: N/A. The
//                               Ventura screener prints no group, so the
//                               group is read by ISIN from another BSE
//                               catalogue that carries it (upstox, then
//                               kotak, then blinkx). A BSE line found in
//                               none of them is N/A. BSE IPFT is not
//                               printed: 0.
//
// In the total: the book, brokerage + GST both ways, the DP debit + GST on
// the sell, STT, stamp, exchange, IPFT, SEBI and GST on exchange and SEBI.
// Cash is rupees only (deposits.mjs) and every line is INR: no FX.
// Remark on a share, at this order's value: "Same day sell is x% lower."
// (an intraday buy and sell: the same brokerage, STT 0.025% on the sell
// only, stamp 0.003% on the buy, no DP debit). Not here: Call & trade
// (₹45 + GST per order, phone), CUSPA, pledges, delayed payment interest.
// A REIT, an InvIT or a partly paid line is not the equity table: N/A.
//
//   node brokers/ventura/ventura_cost.mjs RELIANCE NSE INR --shares=10 --price=1211.2
//   node brokers/ventura/ventura_cost.mjs RELIANCE BSE INR --shares=10 --price=1211.2
//   node brokers/ventura/ventura_cost.mjs NIFTYBEES NSE INR --shares=1000 --price=263.88
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, intradayBuySell, printCli, pct, sebiRate } from "../../indianDelivery.mjs";
import fs from "node:fs";

const CRORE = 1e7;
const PAGE = "https://www.venturasecurities.com/exclusive-pricing-plan/";
const READ_ON = "2026-10-24";
const CATALOGUE = new URL("ventura-parsed.json", import.meta.url);

// BSE per crore of gross turnover, by scrip group (see the header).
const BSE_PER_CRORE = {
  A: 375, B: 375,
  M: 275, MT: 275, TS: 275, MS: 275, IF: 275, IT: 275, R: 275,
  X: 10000, XC: 10000, XD: 10000, XT: 10000, Z: 10000,
  P: 100000, ZP: 100000, SS: 100000, ST: 100000,
};
// ₹375 when the scrip also trades on the NSE, ₹275 when it is BSE-exclusive.
const BSE_SHARED = new Set(["E", "F", "FC", "G", "GC", "I", "W"]);

const readRows = (url) => {
  try {
    const j = JSON.parse(fs.readFileSync(url, "utf8"));
    return Array.isArray(j) ? j : j?.rows || [];
  } catch {
    return [];
  }
};

// ISIN → BSE group, from the catalogues that print it on their BSE lines.
let groups = null;
function groupOf(isin) {
  if (!groups) {
    groups = new Map();
    const sources = [
      ["../upstox/upstox-parsed.json", /\bBSE\s+([A-Z]{1,2})\s+[A-Z]{2}[A-Z0-9]{9}\d\s*$/],
      ["../kotak/kotak-parsed.json", /\bBSE\s+([A-Z]{1,2})(?:\s+[A-Z]{2}[A-Z0-9]{9}\d)?\s*$/],
      ["../blinkx/blinkx-parsed.json", /\bBSE\s+([A-Z]{1,2})(?:\s+[A-Z]{2}[A-Z0-9]{9}\d)?\s*$/],
    ];
    for (const [file, re] of sources) {
      for (const r of readRows(new URL(file, import.meta.url))) {
        if (r.exchange !== "BSE" || !r.isin) continue;
        const key = String(r.isin).toUpperCase();
        if (groups.has(key)) continue;
        const hit = String(r.raw || "").match(re);
        if (hit) groups.set(key, hit[1]);
      }
    }
  }
  return groups.get(String(isin || "").toUpperCase()) || null;
}

// A scrip with an NSE line at Ventura is not BSE-exclusive.
let nseIsins = null;
function onNse(isin) {
  if (!nseIsins) {
    nseIsins = new Set(readRows(CATALOGUE).filter((r) => r.exchange === "NSE" && r.isin).map((r) => String(r.isin).toUpperCase()));
  }
  return nseIsins.has(String(isin || "").toUpperCase());
}

function txnRate(exchange, row) {
  if (exchange === "NSE") return 306.99 / CRORE;
  if (exchange !== "BSE") return null;
  const group = groupOf(row?.isin);
  if (BSE_PER_CRORE[group] != null) return BSE_PER_CRORE[group] / CRORE;
  if (BSE_SHARED.has(group)) return (onNse(row?.isin) ? 375 : 275) / CRORE;
  return null;
}

function brokerageEach(notional) {
  return Math.min(9, notional * pct("0.05"));
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
  broker: "Ventura",
  folder: "ventura",
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  brokerageEach,
  txnRate,
  sttRate: pct("0.1"),
  sttSides,
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: false,
  gstOnDp: true,
  ipftRate: (exchange) => (exchange === "NSE" ? 0.01 / CRORE : 0),
  dpInr: 20,
  basis:
    "Courtage livraison : le plus bas de 9 ₹ et 0,05 % par ordre, + GST 18 %. DP 20 ₹ + GST par titre à la vente. SEBI 0,0001 %, GST sur SEBI et transaction (page tarifs Ventura). " +
    "NSE 306,99 ₹ + IPFT 0,01 ₹ par crore (circulaire NSE/FA/73061). BSE : barème de la BSE par groupe (A, B 0,00375 % ; M, MT, TS, MS, IF 0,00275 % ; X, XT, Z 0,1 % ; P, ZP 1 %), groupe lu par ISIN dans un autre catalogue BSE. " +
    "STT 0,1 % achat et vente, timbre 0,015 % à l'achat ; ETF : 0,001 % à la vente pour un fonds actions, 0 pour or, argent, dette, liquidités ou indice étranger.",
  remark: "",
};

export function roundTrip(query) {
  const cost = indiaRoundTrip(SCHEDULE, query);
  if (cost.listing && cost.listing.brokerExchange === "BSE" && cost.why && /taux de transaction/.test(cost.why)) {
    const group = groupOf(cost.listing.isin);
    return {
      ...cost,
      why: group
        ? `groupe BSE ${group} : pas de taux de transaction publié par la BSE pour ce groupe`
        : "groupe BSE introuvable pour cet ISIN (Ventura ne l'imprime pas) : frais de transaction BSE inconnus",
    };
  }
  // The same-day gap is a share's (an ETF's STT is another rule).
  if (cost.listing?.type !== "STOCK") return cost;
  const out = intradayBuySell(cost, SCHEDULE, brokerageEach);
  return { ...out, remark: String(out.remark || "").replace(/^Intraday buy and sell is /, "Same day sell is ") };
}

printCli(import.meta.url, roundTrip);
