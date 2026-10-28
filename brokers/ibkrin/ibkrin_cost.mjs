// What one round trip costs at Interactive Brokers India: buy n shares at
// price p, sell them straight back, online, in dollars.
//
// Interactive Brokers (India) Pvt. Ltd. (SEBI INZ000217730, NSE trading
// member, NSDL participant). An Indian resident opens "NSE only",
// "overseas only" (a cash account: stocks, bonds and ETFs, no margin, no
// derivatives) or "NSE and overseas". Pages read on 2026-10-20:
//
//   https://www.interactivebrokers.co.in/en/pricing/commissions-nse.php
//   https://www.interactivebrokers.co.in/en/accounts/fees/indiaStockExchangeFees.php
//   https://www.interactivebrokers.co.in/en/pricing/other-fees.php
//   https://www.interactivebrokers.co.in/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.co.in/en/pricing/commissions-spot-currencies.php
//   https://www.interactivebrokers.co.in/en/accounts/individual-account-india.php
//
// NSE, delivery (a stock or an ETF bought and sold back on a later day):
//   Brokerage        1 bps of the order, min INR 6, max INR 20; the part of
//                    an order above INR 10 lakh pays 0.02 % more ("for the
//                    portion above INR 10 lakh, you will be charged 0.02% of
//                    the incremental value"). One order each way.
//   Transaction      NSE 0.0030699 % a side.
//   SEBI             0.0001 % a side (INR 10 a crore).
//   IPFT             0.0000001 % a side (INR 0.01 a crore).
//   Stamp            0.015 % on the buy.
//   STT              0.1 % on the buy and on the sell (a share). An
//                    equity-oriented fund pays 0.001 % on the sell only;
//                    a gold, silver, debt, liquid or foreign-index ETF is
//                    not one and pays none.
//   GST              18 % of brokerage, transaction and SEBI charges.
//   Demat            INR 4.50 a stock on a sale (no GST printed: 0).
//   Same day: STT 0.025 % on the sell only (0.001 % for an equity fund),
//   stamp 0.003 %, no demat debit; brokerage, exchange and SEBI unchanged.
//   That gap is the remark "Same day sell fees are x% lower.", x = its cut of the
//   round trip's fees and levies at this notional.
//   A REIT, an InvIT, a preference share or a buy-back line is not the
//   equity table: N/A. IBKR charges no custody.
//
// Overseas: the .co.in stock page prints the global card (US, Canada,
// Europe, Asia ...) word for word, applied here through `makeIbkr` from
// brokers/ibkrca/ibkrca_cost.mjs, plus "Goods and services tax (currently
// 18% ...)", which "may be subject to GST even for services provided and
// consumed outside of India": 18 % on the commission.
//
// Who holds the overseas cash (checked on 2026-10-20). IB India itself
// "offers only services as permitted under the NSE, NSDL and SEBI
// regulations"; the overseas account is a separate one with Interactive
// Brokers LLC (IBKR's "dual account structure for Indian residents": "one
// account with Interactive Brokers LLC and another account with Interactive
// Brokers (India) Pvt Ltd", "funded separately", no money moving between
// them). It is paid in by an LRS remittance: "The bank will debit your
// account for INR, convert it to US$ or another currency such as EUR or JPY
// and remit the funds abroad." The account minimum is "USD 500 (or non-USD
// equivalent)". So the overseas cash is held in dollars (or the other
// currency remitted) and is not converted by IBKR; only the IB India (NSE)
// account is INR-only ("Accounts opened via IBKR (India) Pvt. Ltd can only
// use INR as the base currency"; the funding tool for an Indian resident
// answers ibEntity "IN", currencies ["INR"]: that is the NSE account,
// https://www.interactivebrokers.co.in/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=IND). The bank's INR -> USD rate is the funding
// leg, outside the trade, like any IBKR client's own bank conversion.
//   https://www.interactivebrokers.co.in/en/accounts/individual-account-india.php
//   https://www.interactivebrokers.co.in/en/accounts/account-guide.php
//   https://www.interactivebrokers.com/en/accounts/configuring-your-account.php
//   https://www.interactivebrokers.com/webinars/2020-WB-3329-InvestinginGlobalMarketsthroughInteractiveBrokersforIndianResidents.pdf
//   https://www.interactivebrokers.com/webinars/2017-WB-2760DemystifyInvestinginGlobalMarketsforIndianResidents.pdf
// The cost follows deposits.mjs. While it lists INR alone for ibkrin, a
// non-INR line is a forced INR -> currency conversion by the remitting bank
// with no published rate: the total is N/A (as at Dhan). Once it lists the
// overseas currencies, a line in one of them is the remark "FX 0.03% when
// cash ≠ CCY." and any other currency (TWD, MYR, BRL, SAR, RON ...) converts
// from the dollar cash at IBKR's 0.03 % both ways, in the total (makeIbkr).
//
//   node brokers/ibkrin/ibkrin_cost.mjs RELIANCE XNSE INR --shares=10 --price=1400
//   node brokers/ibkrin/ibkrin_cost.mjs NIFTYBEES XNSE INR --shares=100 --price=280
//   node brokers/ibkrin/ibkrin_cost.mjs AAPL XNAS USD --shares=5 --price=230
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { makeIbkr, runCli } from "../ibkrca/ibkrca_cost.mjs";
import { productOf, roundPct } from "../../indianDelivery.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { QUOTE, toUsd } from "../../fx.mjs";
import { depositHas, currencyOptions } from "../../deposits.mjs";

export const READ_ON = "2026-10-20";

const FOLDER = "ibkrin";
const ENTITY = "Interactive Brokers India";
const NSE_PAGE = "https://www.interactivebrokers.co.in/en/pricing/commissions-nse.php";
const GLOBAL_PAGE = "https://www.interactivebrokers.co.in/en/pricing/commissions-stocks.php";

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

// Brokerage of one NSE order of `value` rupees.
export function nseBrokerage(value) {
  const first = Math.min(NSE.max, Math.max(NSE.min, NSE.rate * Math.min(value, NSE.band)));
  return first + NSE.above * Math.max(0, value - NSE.band);
}

// An ETF that is not an equity-oriented fund (gold, silver, debt, liquid,
// foreign index) pays no STT.
const NON_EQUITY_FUND =
  /GOLD|SILVER|SILVR|LIQUID|LIQUI|\bLIQ\b|GILT|\bGLT\b|GSEC|G-SEC|SDL|BOND|BHARAT BOND|1D RAT|OVERNIGHT|MONEY MARKET|TBILL|NASDAQ|NASDQ|NAS100|MON100|N100|FANG|S&P 500|SP500|HANG SENG|HNGSNG|NYSE|MAHKTECH|MASPTOP50|US TECH|GLOBAL|INTERNATIONAL/i;

function sttOf(listing) {
  if (listing.type === "STOCK") return { kind: "stock", delivery: 2 * NSE.sttStock, sameDay: NSE.sttSameDay };
  const text = `${listing.name || ""} ${listing.ticker || ""}`;
  if (NON_EQUITY_FUND.test(text)) return { kind: "fund0", delivery: 0, sameDay: 0 };
  return { kind: "fund", delivery: NSE.sttEquityFund, sameDay: NSE.sttEquityFund };
}

const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const catalogueUrl = new URL("ibkrin-parsed.json", import.meta.url);
const catalogue = fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;

// Overseas lines: the global card, GST on the commission.
const global = makeIbkr({
  folder: FOLDER,
  entity: ENTITY,
  base: "INR",
  page: GLOBAL_PAGE,
  catalogueUrl,
  catalogue,
  commissionTax: { rate: NSE.gst, label: "GST 18 %" },
});

// Whether deposits.mjs lists any currency besides the rupee for this folder.
const foreignCash = () => currencyOptions().some(({ code }) => code !== "INR" && depositHas(FOLDER, null, code));

function nseRoundTrip(found, { shares, price }) {
  const listing = found.listing;
  const shared = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf: found.etf,
    place: found.place,
    currency: found.currency,
    onlineBuy: true,
    cashCurrency: "INR",
    url: NSE_PAGE,
    remark: "",
    listing,
    feeMarket: "nse",
    plan: "standard",
    bp: found.bp,
    perShare: found.perShare,
  };
  const row = { isin: listing.isin, name: listing.name, ticker: listing.ticker, type: listing.type, exchange: "NSE" };
  const partly = /^IN9/.test(listing.isin || "") && /PARTLY PAID/i.test(listing.name || "");
  if (productOf(row) !== "equity" && !partly) {
    return { ...shared, why: `${listing.ticker || listing.isin} n'est pas au barème action et ETF de NSE (REIT, InvIT, préférence ou rachat)` };
  }
  const n = Number(shares);
  const p = Number(price);
  const basis = `${ENTITY}, NSE livraison, page relue le ${READ_ON} : 1 bp par ordre, min 6 ₹, max 20 ₹, 0,02 % au-delà de 10 lakh`;
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
  const parts = bookParts({ bp: found.bp, perShare: found.perShare, venue: found.venue, unsourced: null, toUsd: (v) => dollars(v, "INR") });
  const bookUsd = parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, leviesUsd);

  // Same day: STT and stamp lower, no demat debit; the remark is that cut
  // of the trip's fees and levies.
  const sameDayGap = notional * (stt.delivery - stt.sameDay) + notional * (NSE.stamp - NSE.stampSameDay) + NSE.demat;
  const gapPct = roundPct((100 * sameDayGap) / (brokerInr + levyInr));
  const remark = gapPct > 0 ? `Same day sell fees are ${gapPct}% lower.` : "";

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
    remark,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    basis,
    confidence: [
      `${ENTITY}, NSE : courtage ${each.toFixed(2).replace(".", ",")} ₹ par ordre`,
      each === NSE.max && notional <= NSE.band ? "courtage au plafond de 20 ₹" : each === NSE.min ? "courtage au plancher de 6 ₹" : "courtage au taux",
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

export function roundTrip(query) {
  const answer = global.roundTrip(query);
  const listing = answer.listing;
  if (!listing) return answer;
  if (listing.mic === "XNSE" || listing.currency === "INR") {
    return nseRoundTrip({ ...answer, venue: listing.mic === "XNSE" ? { mic: "XNSE" } : null }, query);
  }
  // Overseas line: held at Interactive Brokers LLC once deposits.mjs lists
  // its currencies; a currency not held converts out of the dollar cash.
  if (depositHas(FOLDER, null, listing.currency) || foreignCash()) {
    return answer.cashCurrency === "INR" ? { ...answer, cashCurrency: "USD" } : answer;
  }
  // Rupees only: the conversion out of rupees is the remitting bank's.
  const why = `change forcé INR → ${listing.currency} : versement LRS converti par la banque indienne, taux non publié (IBKR ne convertit pas la roupie)`;
  return {
    ...answer,
    usd: null,
    brokerFees: null,
    fxIfConverted: null,
    why: [answer.why, why].filter(Boolean).join(" ; "),
    ...(answer.parts ? { parts: { ...answer.parts, change: null } } : {}),
    ...(answer.confidence
      ? {
          confidence: answer.confidence.replace(
            /n'est pas une devise de dépôt : conversion automatique 0,03 % par sens dans le total/,
            "n'est pas une devise de dépôt : conversion depuis la roupie par la banque (LRS), taux non publié"
          ),
        }
      : {}),
  };
}

runCli(import.meta.url, roundTrip);
