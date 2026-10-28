// What one round trip costs at Place Trade: buy n shares at price p, sell
// them straight back, online, in dollars.
//
// Place Trade Financial, Inc. (Raleigh NC; FINRA / SIPC member) is an
// introducing broker of Interactive Brokers: the accounts are opened on
// clientam.com (partnerID=placetrade) and carried by Interactive Brokers
// LLC, whose 606 report Place Trade posts as its own ("we have included the
// Disclosure Regarding Order Routing Information of our clearing firm").
// Price list read on 2026-10-26 (tables in the pages' embedded frames):
//
//   https://placetrade.com/commissions-stocks            (US, Canada, Mexico)
//   https://placetrade.com/commission%3A-stocks-emea-1   (Austria to Germany)
//   https://placetrade.com/commission%3A-stocks-emea-2   (Hungary to Portugal)
//   https://placetrade.com/commission%3A-stocks-emea-3   (Russia to United Kingdom)
//   https://placetrade.com/commissions-stocks-apac       (Australia to Taiwan)
//   https://placetrade.com/order-routing-practices       (606: IBKR's)
//
// The tables are IBKR's Fixed card, with Place Trade's own US and German
// rows. So the file is `makeIbkr` (brokers/ibkrca/ibkrca_cost.mjs) with the
// rows that differ overridden:
//
//   United States   "USD 0.01 per share", "Minimum per order (shares) USD
//                   1.50", "Maximum per order 1% of Trade Value"; the
//                   exchange, clearing and pass-through fees "are already
//                   included in the price per share". Both worked examples
//                   cap at 1.5 % ("1,000 Shares @ USD 0.25 Share Price = USD
//                   3.75"; "capped at 10 shares x 0.20 x 1.50% = 0.03"), so
//                   the higher figure is used (owner rule: take the max).
//                   The cap wins under the minimum (the page's own note).
//                   Regulatory fees on top, as printed: SEC 0.0000278 of the
//                   sale value, FINRA TAF 0.000166 a share sold (max USD 8.30
//                   a trade), CAT "0.000035 * Quantity to 0.000046 *
//                   Quantity" (0.000046 used, each side). "USD 0 on no
//                   transaction fee ETFs": no list is printed, so every ETF
//                   pays the standard rate.
//   Germany         Börse Stuttgart: "Direct Routed (SWB) 0.12% of Trade
//                   Value", min EUR 6 ("400 Shares @ EUR 15 = EUR 7.20");
//                   gettex: "Direct Routed (GETTEX) 0.05% of TV", min EUR 3.
//                   Third party "None".
//   Hungary         HUF as IBKR (buys 0.55 % to HUF 4 444 444 then 0.1 %,
//                   sells 0.1 %, min HUF 200); EUR lines 0.05 %, min EUR 3.
//   Switzerland     CHF 0.05 % min 5, EUR min 3, GBP min 3 (the column
//                   prints "EUR 3.00", the example "150 Shares @ GBP 40 =
//                   GBP 3.00"), USD min 4. No JPY or CAD column: N/A.
//
// Same as IBKR Fixed (Smart Routed column): Canada CAD 0.01 a share min 1
// max 0.5 %, TSX USD 0.008 min 0.80 max 0.4 %; Mexico 0.1 % min MXN 60;
// Austria, Belgium, France, Italy, Spain, Netherlands EUR 0.05 % min 3
// (Netherlands USD min 4); UK GBP / EUR min 3 (the EUR column prints
// "USD 3.00", its example "75 Shares @ EUR 80 = EUR 3.00"), USD min 4;
// Denmark, Norway 0.05 % min 49, Sweden SEK 0.05 % min 49 / EUR 0.10 % min
// 4; Portugal 0.15 % min 6; Baltics 0.2 % min 10; Poland 0.1 % min PLN 15;
// Czech 0.15 % min CZK 70; Slovenia 0.35 % min EUR 3; Israel 0.1 % min ILS
// 15; Saudi 0.10 %, no minimum; Australia 0.08 % min AUD 6; Japan 0.08 % min
// JPY 80; Hong Kong 0.08 % min HKD 18 / USD 2.25 / CNH 15 (Stock Connect on
// the CNH column); Singapore 0.08 % min SGD 2.50 / USD 2 / GBP 1.40 / HKD
// 14.50 / EUR 2; Malaysia and Taiwan Tiered only, first tier 0.08 % min MYR
// 12 / TWD 80. Euronext FR/NL/BE ETFs: "EUR 0.75 per execution exchange fee
// passed through"; PTM levy 1.50 GBP a side above GBP 10 000.
//
// Third-party fees Place Trade names without a figure (Hong Kong and Stock
// Connect "Regulatory Fees", Malaysia and Taiwan "Third Party Pass Through
// Fees") are taken from IBKR's own pages, the carrying broker of the
// account, as makeIbkr writes them out. The Czech and Ljubljana pass-through
// is a 0.05 % a year position fee: a holding cost, left out.
//
// NSE (Indian residents only; rows flagged indianOnly): "1 bps", min INR 6,
// max INR 20, "Portion of order above INR 1,000,000 will be charged 2 bps".
// Its third-party line ("Securities Transaction Tax, Exchange Charges,
// Statutory Tax and GST & Regulatory Fees") prints no figure: the rates are
// Interactive Brokers India's (the NSE member behind IBKR's NSE access),
// as in brokers/ibkrin/ibkrin_cost.mjs: NSE 0.0030699 % and SEBI 0.0001 % a
// side, IPFT, stamp 0.015 % on the buy, STT, GST 18 % on brokerage, exchange
// and SEBI, demat INR 4.50 on the sale. Cash INR.
//
// FX: Place Trade prints no conversion fee ("Place Trade does not offer ...
// forex trading"). The account is an IBKR LLC account, so IBKR's 0.03 %
// auto-conversion is the stand-in: a remark "FX 0.03% when cash ≠ CCY." on
// a deposit currency (deposits.mjs), both ways in the total otherwise (MYR,
// TWD, SAR ...). Stamp / FTT from taxMap.mjs. US book: IBKR LLC's 606 Q.
// Not in the number: custody (none printed), market data, the 0.05 % a year
// Prague / Ljubljana position fee, withdrawals.
//
//   node brokers/placetrade/placetrade_cost.mjs AAPL XNAS USD --shares=4 --price=230
//   node brokers/placetrade/placetrade_cost.mjs SAP XMUN EUR --shares=4 --price=220
//   node brokers/placetrade/placetrade_cost.mjs 700 XHKG HKD --shares=100 --price=500
//   node brokers/placetrade/placetrade_cost.mjs RELIANCE XNSE INR --shares=60 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { makeIbkr, runCli, READ_ON as IBKR_READ_ON } from "../ibkrca/ibkrca_cost.mjs";
import { productOf, roundPct } from "../../indianDelivery.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { QUOTE, toUsd } from "../../fx.mjs";

export const READ_ON = "2026-10-26";

const FOLDER = "placetrade";
const ENTITY = "Place Trade";
const PAGES = {
  americas: "https://placetrade.com/commissions-stocks",
  emea1: "https://placetrade.com/commission%3A-stocks-emea-1",
  emea2: "https://placetrade.com/commission%3A-stocks-emea-2",
  emea3: "https://placetrade.com/commission%3A-stocks-emea-3",
  apac: "https://placetrade.com/commissions-stocks-apac",
};
const PAGE_OF = {
  us: "americas", tsx: "americas", ca: "americas", mx: "americas",
  at: "emea1", baltic: "emea1", be: "emea1", cz: "emea1", dk: "emea1", fr: "emea1", swb: "emea1", gettex: "emea1",
  hu: "emea2", il: "emea2", it: "emea2", nl: "emea2", no: "emea2", pl: "emea2", pt: "emea2",
  sa: "emea3", si: "emea3", es: "emea3", se: "emea3", ch: "emea3", uk: "emea3",
  au: "apac", hk: "apac", connect: "apac", nse: "apac", jp: "apac", my: "apac", sg: "apac", tw: "apac",
};

// US regulatory fees as Place Trade prints them.
const US = { sec: 0.0000278, taf: 0.000166, tafMax: 8.3, cat: 0.000046 };

const SMART = "Smart Routed";
const p5 = (min) => ({ rate: 0.0005, min });
const MARKETS = {
  us: {
    column: SMART,
    levies: "placetrade-us",
    byCcy: { USD: { perShare: 0.01, min: 1.5, maxPct: 0.015, fractionalFloor: 0.01 } },
  },
  swb: { label: "Allemagne (Börse Stuttgart)", column: "Direct Routed (SWB)", byCcy: { EUR: { rate: 0.0012, min: 6 } } },
  gettex: { label: "Allemagne (gettex)", column: "Direct Routed (GETTEX)", byCcy: { EUR: p5(3) } },
  hu: { byCcy: { EUR: p5(3) } },
  ch: { byCcy: { JPY: null } },
};
const BY_MIC = { XSTU: "swb", XMUN: "gettex" };

const NSE = {
  rate: 0.0001,
  min: 6,
  max: 20,
  band: 1_000_000,
  above: 0.0002,
  txn: 0.000030699,
  sebi: 0.000001,
  ipft: 0.000000001,
  stamp: 0.00015,
  stampSameDay: 0.00003,
  sttStock: 0.001,
  sttSameDay: 0.00025,
  sttEquityFund: 0.00001,
  gst: 0.18,
  demat: 4.5,
};
const NSE_FEES = "https://www.interactivebrokers.co.in/en/accounts/fees/indiaStockExchangeFees.php";

const catalogueUrl = new URL("placetrade-parsed.json", import.meta.url);
const catalogue = fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;

const core = makeIbkr({
  folder: FOLDER,
  entity: ENTITY,
  base: "USD",
  page: PAGES.americas,
  catalogueUrl,
  catalogue,
  markets: MARKETS,
  byMic: BY_MIC,
});

const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const num = (x) => String(x).replace(".", ",");

// Place Trade's wording over the engine's IBKR wording.
function reword(text) {
  if (!text) return text;
  return text
    .replaceAll(`relue le ${IBKR_READ_ON}`, `relue le ${READ_ON}`)
    .replaceAll("Fixed + IB SmartRouting", SMART)
    .replaceAll("grille Fixed SmartRouting", "grille")
    .replace(
      /conversion automatique 0,03 % par sens dans le total/,
      "conversion 0,03 % par sens dans le total (taux d'IBKR LLC, teneur du compte : Place Trade n'en publie pas)",
    )
    .replace(/conversion 0,03 % hors total/, "conversion 0,03 % hors total (taux d'IBKR LLC, Place Trade n'en publie pas)");
}

/** Brokerage of one NSE order of `value` rupees. */
export function nseBrokerage(value) {
  const first = Math.min(NSE.max, Math.max(NSE.min, NSE.rate * Math.min(value, NSE.band)));
  return first + NSE.above * Math.max(0, value - NSE.band);
}

const NON_EQUITY_FUND =
  /GOLD|SILVER|SILVR|LIQUID|LIQUI|\bLIQ\b|GILT|\bGLT\b|GSEC|G-SEC|SDL|BOND|BHARAT BOND|1D RAT|OVERNIGHT|MONEY MARKET|TBILL|NASDAQ|NASDQ|NAS100|MON100|N100|FANG|S&P 500|SP500|HANG SENG|HNGSNG|NYSE|MAHKTECH|MASPTOP50|US TECH|GLOBAL|INTERNATIONAL/i;
function sttOf(listing) {
  if (listing.type === "STOCK") return { kind: "stock", delivery: 2 * NSE.sttStock, sameDay: NSE.sttSameDay };
  if (NON_EQUITY_FUND.test(`${listing.name || ""} ${listing.ticker || ""}`)) return { kind: "fund0", delivery: 0, sameDay: 0 };
  return { kind: "fund", delivery: NSE.sttEquityFund, sameDay: NSE.sttEquityFund };
}

function nseRoundTrip(answer, { shares, price }) {
  const listing = answer.listing;
  const shared = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf: answer.etf,
    place: answer.place,
    currency: answer.currency,
    onlineBuy: true,
    cashCurrency: "INR",
    url: PAGES.apac,
    remark: "",
    listing,
    feeMarket: "nse",
    bp: answer.bp,
    perShare: answer.perShare,
  };
  const row = { isin: listing.isin, name: listing.name, ticker: listing.ticker, type: listing.type, exchange: "NSE" };
  const partly = /^IN9/.test(listing.isin || "") && /PARTLY PAID/i.test(listing.name || "");
  if (productOf(row) !== "equity" && !partly) {
    return { ...shared, why: `${listing.ticker || listing.isin} n'est pas au barème action et ETF de NSE (REIT, InvIT, préférence ou rachat)` };
  }
  const n = Number(shares);
  const p = Number(price);
  const basis = `${ENTITY}, Inde (NSE), page relue le ${READ_ON} : 1 bp par ordre, min 6 ₹, max 20 ₹, 2 bp sur la part au-delà de 10 lakh`;
  if (!(n > 0)) return { ...shared, basis, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, basis, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const each = nseBrokerage(notional);
  const brokerage = 2 * each;
  const txn = 2 * notional * NSE.txn;
  const sebi = 2 * notional * NSE.sebi;
  const ipft = 2 * notional * NSE.ipft;
  const stamp = notional * NSE.stamp;
  const stt = sttOf(listing);
  const sttInr = notional * stt.delivery;
  const gstBroker = NSE.gst * brokerage;
  const gstLevy = NSE.gst * (txn + sebi);
  const brokerInr = brokerage + gstBroker + NSE.demat;
  const levyInr = txn + sebi + ipft + stamp + sttInr + gstLevy;

  const notionalUsd = dollars(notional, "INR");
  const brokerFees = dollars(brokerInr, "INR");
  const leviesUsd = dollars(levyInr, "INR");
  const parts = bookParts({
    bp: answer.bp,
    perShare: answer.perShare,
    venue: { mic: "XNSE" },
    unsourced: null,
    toUsd: (v) => dollars(v, "INR"),
  });
  const bookUsd = parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, leviesUsd);

  // Same day: STT and stamp lower, no demat debit; the remark is that cut
  // of the trip's fees and levies.
  const sameDayGap = notional * (stt.delivery - stt.sameDay) + notional * (NSE.stamp - NSE.stampSameDay) + NSE.demat;
  const gapPct = roundPct((100 * sameDayGap) / (brokerInr + levyInr));

  const unknown = [
    bookUsd == null ? `aucun carnet pour ${listing.exchange || "NSE"} : pas de feuille de carnet` : null,
    notionalUsd == null ? "aucun cours en dollars pour INR dans fx.mjs" : null,
  ].filter(Boolean);
  const sttText =
    stt.kind === "stock"
      ? "STT 0,1 % à l'achat et à la vente"
      : stt.kind === "fund"
        ? "fonds actions : STT 0,001 % à la vente seulement"
        : "ETF hors actions (or, argent, dette, liquidités, indice étranger) : pas de STT";

  return {
    ...shared,
    remark: gapPct > 0 ? `Same day sell fees are ${gapPct}% lower.` : "",
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    basis,
    confidence: [
      basis,
      `courtage ${num(each.toFixed(2))} ₹ par ordre`,
      each === NSE.max && notional <= NSE.band ? "courtage au plafond de 20 ₹" : each === NSE.min ? "courtage au plancher de 6 ₹" : "courtage au taux",
      `frais tiers sans chiffre chez Place Trade : taux d'Interactive Brokers India (${NSE_FEES})`,
      "transaction NSE 0,0030699 % et SEBI 0,0001 % par sens, IPFT 0,0000001 %",
      "timbre 0,015 % à l'achat",
      sttText,
      "GST 18 % sur courtage, transaction et SEBI",
      "débit démat 4,50 ₹ à la vente (pas de GST publiée)",
    ].join(" ; "),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: "INR" },
    commission: { buy: each, sell: each, currency: "INR", eachWay: true, rate: NSE.rate, min: NSE.min, max: NSE.max, tax: NSE.gst, dp: NSE.demat },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(dollars(brokerage + gstBroker, "INR"), 6),
      change: 0,
      frais: finite(dollars(NSE.demat + txn + sebi + ipft + gstLevy, "INR"), 6),
      taxes: finite(dollars(stamp + sttInr, "INR"), 6),
    },
  };
}

// US regulatory fees Place Trade prints, on top of the per-share price.
function withUsFees(answer) {
  const t = answer.trade;
  if (!t || !(t.shares > 0)) return answer;
  const n = t.shares;
  const sec = t.notional * US.sec;
  const taf = Math.min(US.tafMax, n * US.taf);
  const cat = 2 * n * US.cat;
  const feesUsd = sec + taf + cat;
  const parts = answer.parts ? { ...answer.parts, frais: finite(plus(answer.parts.frais, feesUsd), 6) } : answer.parts;
  return {
    ...answer,
    usd: answer.usd == null ? null : finite(plus(answer.usd, feesUsd), 6),
    parts,
    confidence: [
      answer.confidence,
      `frais réglementaires imprimés : SEC 0,0000278 de la vente, TAF 0,000166 $ la part vendue (max 8,30 $), CAT 0,000046 $ la part dans les deux sens, ${Number(feesUsd.toPrecision(3))} $ ; bourse, compensation et pass-through inclus dans le prix par part`,
      "plafond 1,5 % des exemples de la page (le tableau imprime 1 %)",
    ]
      .filter(Boolean)
      .join(" ; "),
  };
}

export function roundTrip(query) {
  const answer = core.roundTrip(query);
  const listing = answer.listing;
  if (!listing) return answer;
  if (listing.mic === "XNSE" || code(listing.brokerExchange) === "NATIONAL STOCK EXCHANGE OF INDIA") {
    return nseRoundTrip(answer, query);
  }
  const page = PAGES[PAGE_OF[answer.feeMarket]] ?? answer.url;
  const out = {
    ...answer,
    url: page,
    ...(answer.basis ? { basis: reword(answer.basis) } : {}),
    ...(answer.confidence ? { confidence: reword(answer.confidence) } : {}),
    ...(answer.why ? { why: reword(answer.why) } : {}),
  };
  return out.feeMarket === "us" ? withUsFees(out) : out;
}

function code(s) {
  return String(s || "").trim().toUpperCase();
}

runCli(import.meta.url, roundTrip);
