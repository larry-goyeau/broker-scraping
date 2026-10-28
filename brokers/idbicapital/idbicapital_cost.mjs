// What one round trip costs at IDBI Capital (idbidirect.in): buy n shares,
// sell them back, equity delivery, online, in dollars. NSE and BSE, rupees
// only.
//
// https://www.idbidirect.in/Offering-Innerpage.aspx?Option=brokerage read on
// 2026-10-23, "Card Rate" (the default plan):
//   Delivery brokerage          0.50% per leg
//   Square-off brokerage        0.05% per leg (bought and sold the same day
//                               on the same exchange)
//   Minimum                     "Rs. 25/- per exchange per segment", and for
//                               a scrip priced up to Rs 10, Rs 0.04 a share
//   "Service Tax, STT, Stamp Duty and other Statutory/Exchange charges, as
//   applicable, will be charged in addition to the brokerage rates."
// The "Ace Trader Plan" on the same page is the same 0.50% up to ₹2 lakh of
// delivery turnover in the calendar month, then 0.45% down to 0.10% above
// ₹10 crore, on the increment. IDBI Bank's ICMS 3-in-1 sheet (w.e.f. 3 April
// 2026, https://www.idbidirect.in/pdf/DEPOSITORY_NEW.pdf) prints delivery
// from 0.10% (Opulentia) to 0.50% (IDBI Savings, all other variants) by the
// bank category. One order at the default is 0.50% in all three; the lower
// rates are the remark "Fees might be up to 80% lower." (0.50% → 0.10%, a
// cut of the brokerage; the ₹25 minimum binds only under ₹25,000).
//
// DP on a delivery sell: IDBI Capital's own NSDL DP (IN300079),
// https://www.idbidirect.in/download/DEPOSITORY%20FEE%20STRUCTURE%20-%20General%20new%203.0.pdf
// read on 2026-10-23: "Transaction charges for DP – Debit Transaction (For
// Online as well as Offline clients. Trade done thru our portal) Rs.25/- per
// Transaction", and "Govt. tax and other statutory charges if applicable
// will be levied separately": ₹25 plus 18% GST. AMC is ₹350 a year and stays
// out.
//
// The statutory lines are not printed with figures, so the law's and the
// exchanges' are used, as in hdfcsky and arihant:
//   STT                         0.1% on the buy and on the sell. An ETF:
//                               0.001% on the sell for an equity fund, none
//                               for gold, silver, debt, liquid or a foreign
//                               index (as in lemonn)
//   Stamp                       0.015% on the buy
//   Transaction                 NSE 0.00297%, BSE 0.00375%
//   SEBI                        ₹10 per crore
//   GST                         18% of brokerage, the exchange charge and SEBI
//   IPFT                        not printed: 0
//
// In the total: the book, brokerage, DP, STT, stamp, exchange, SEBI and GST.
// Remark on a share, at this order's value: "Same day sell fees are x% lower." (an
// intraday buy and sell: square-off brokerage, STT 0.025% on the sell only,
// stamp 0.003%, no DP debit). Cash is rupees only (deposits.mjs) and every
// line is INR: no FX. Encash (1%), e-Margin and Margin are other products. A
// REIT, an InvIT or a partly paid line is not the equity table: N/A.
//
//   node brokers/idbicapital/idbicapital_cost.mjs RELIANCE NSE INR --shares=60 --price=1450
//   node brokers/idbicapital/idbicapital_cost.mjs NIFTYBEES NSE INR --shares=300 --price=290
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, intradayBuySell, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const PAGE = "https://www.idbidirect.in/Offering-Innerpage.aspx?Option=brokerage";
const READ_ON = "2026-10-23";
const DELIVERY = pct("0.50");
const SQUARE_OFF = pct("0.05");
const MIN_ORDER = 25;
const LOW_PRICE = 10;
const LOW_PRICE_PER_SHARE = 0.04;
const LOWER = "Fees might be up to 80% lower.";

// A leg's brokerage at `rate`, with the two printed minimums. The shares are
// the notional over the price of this query.
function legAt(rate, price) {
  return (notional) => {
    const shares = price > 0 ? notional / price : 0;
    const perShareFloor = price > 0 && price <= LOW_PRICE ? shares * LOW_PRICE_PER_SHARE : 0;
    return Math.max(notional * rate, MIN_ORDER, perShareFloor);
  };
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

function schedule(price) {
  return {
    broker: "IDBI Capital",
    folder: "idbicapital",
    catalogueUrl: new URL("idbicapital-parsed.json", import.meta.url),
    url: PAGE,
    readOn: READ_ON,
    brokerageEach: legAt(DELIVERY, price),
    txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
    sttRate: pct("0.1"),
    sttSides,
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnDp: true,
    ipftRate: 0,
    dpInr: 25,
    basis:
      "Card Rate : courtage livraison 0,50 % par jambe, minimum 25 ₹ (0,04 ₹ par titre sous 10 ₹). " +
      "DP 25 ₹ + GST à la vente (DP IDBI Capital IN300079). STT, timbre, bourse, SEBI au taux légal ; IPFT non imprimé : 0.",
    remark: LOWER,
  };
}

export function roundTrip(query) {
  const price = Number(query.price);
  const sched = schedule(price);
  const cost = indiaRoundTrip(sched, query);
  // The same-day gap is a share's (an ETF's STT is another rule).
  if (cost.listing?.type !== "STOCK" || cost.usd == null && cost.brokerFees == null) return cost;
  const out = intradayBuySell({ ...cost, remark: "" }, sched, legAt(SQUARE_OFF, price));
  const sameDay = String(out.remark || "").replace(/^Intraday buy and sell fees are /, "Same day sell fees are ");
  return { ...out, remark: [sameDay, LOWER].filter(Boolean).join(" ") };
}

printCli(import.meta.url, roundTrip);
