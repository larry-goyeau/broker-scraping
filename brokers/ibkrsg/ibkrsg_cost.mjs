// What one round trip costs at IBKR for a Singapore resident: buy n shares
// at price p, sell them straight back, online, in dollars.
//
// Interactive Brokers Singapore Pte. Ltd. (MAS licence CMS100917) is the
// contracting broker; the funding tool on the .com.sg site files a
// Singapore resident under it, with SGD as the domestic currency. The
// catalogue is the IBKR group's stock and ETF book under the "com.sg"
// domain (`ibkrsg_scraping.mjs`). The price list is IBKR Singapore's, read
// on 2026-10-20:
//
//   https://www.interactivebrokers.com.sg/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.com.sg/en/pricing/commissions-spot-currencies.php
//
// Its stock tables are word for word the Canadian ones, plus an IBKR Lite
// column. So there are two plans, one row each (`plan`), built by
// `makeIbkrProLite` in brokers/ibkrca/ibkrca_cost.mjs:
//
//   "pro" (default)  IBKR Pro Fixed + IB SmartRouting, every market as
//                    written out in brokers/ibkrca/ibkrca_cost.mjs (SGX
//                    0.08 %, min SGD 2.50 / USD 2 / GBP 1.40 / HKD 14.50 /
//                    EUR 2; US USD 0.005 a share, min 1, max 1 % ...; Korea,
//                    Taiwan, Malaysia and Brazil on the first Tiered bucket).
//   "lite"           IBKR Lite ("Singapore Retail Investors"): USD 0
//                    commission on US exchange-listed stocks and ETFs priced
//                    at USD 1 or more in regular and extended hours (sub-
//                    dollar and overnight up to 10 % of the month's volume).
//                    OTC Markets lines and every other market are on Fixed
//                    pricing. SEC, TAF and CAT still apply.
//
// GST: "Goods and services tax (currently 9% ...) will be separately applied
// to eligible services. The commissions and fees that we charge you may be
// subject to GST even for services provided and consumed outside of
// Singapore." A brokerage commission is a standard-rated service for a
// Singapore resident, so 9 % is added to every commission (nothing on a
// Lite USD 0 one). Exchange and regulatory pass-throughs are left as
// printed.
//
// The account is in SGD; a listing in one of the eight deposit currencies
// (AUD, CNH, EUR, GBP, HKD, JPY, SGD, USD; deposits.mjs) is a remark, "FX
// 0.03% when cash ≠ CCY." (the auto-conversion spread), any other (CAD,
// CHF, KRW, MYR, ...) converts both ways at 0.03 % in the total. Custody is
// free. US book: Interactive Brokers LLC's 606 Q (IBKR Singapore's US
// orders are carried there).
//
//   node brokers/ibkrsg/ibkrsg_cost.mjs A35 XSES SGD --shares=1000 --price=1.1
//   node brokers/ibkrsg/ibkrsg_cost.mjs AAPL XNAS USD --shares=5 --price=230
//   node brokers/ibkrsg/ibkrsg_cost.mjs AAPL XNAS USD --shares=5 --price=230 --plan=lite
//
// `roundTrip(...)` reads files, not the network.

import { makeIbkrProLite, runCli, PLANS } from "../ibkrca/ibkrca_cost.mjs";

export { PLANS };
export const GST = 0.09;

const ibkrsg = makeIbkrProLite({
  folder: "ibkrsg",
  entity: "Interactive Brokers Singapore",
  base: "SGD",
  page: "https://www.interactivebrokers.com.sg/en/pricing/commissions-stocks.php",
  catalogueUrl: new URL("ibkrsg-parsed.json", import.meta.url),
  commissionTax: { rate: GST, label: "GST 9 % (résident singapourien)" },
});

export const roundTrip = ibkrsg.roundTrip;

runCli(import.meta.url, roundTrip);
