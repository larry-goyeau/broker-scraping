// What one round trip costs at Interactive Brokers for a US resident: buy n
// shares at price p, sell them straight back, online, in dollars.
//
// Interactive Brokers LLC (Greenwich CT; NYSE, FINRA, SIPC member) is the
// contracting broker. The catalogue is the IBKR group's stock and ETF book
// under the "com" domain (`ibkrus_scraping.mjs`), without the non-US ETFs a
// US client cannot buy. The price list is the US page, read on 2026-10-20:
//
//   https://www.interactivebrokers.com/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.com/en/pricing/commissions-spot-currencies.php
//
// Its stock tables are word for word the Canadian ones, plus an IBKR Lite
// column. So there are two plans, one row each (`plan`), built by
// `makeIbkrProLite` in brokers/ibkrca/ibkrca_cost.mjs:
//
//   "pro" (default)  IBKR Pro Fixed + IB SmartRouting, every market as
//                    written out in brokers/ibkrca/ibkrca_cost.mjs (US USD
//                    0.005 a share, min 1, max 1 %; Europe 0.05 % min 3 ...;
//                    Korea, Taiwan, Malaysia and Brazil on the first Tiered
//                    bucket), shared through `makeIbkr`.
//   "lite"           IBKR Lite ("US Residents Only"): USD 0 commission, no
//                    minimum, on US exchange-listed stocks and ETFs (sub-
//                    dollar and outside-RTH orders too, up to 10 % of the
//                    month's US volume). OTC Markets lines ("non-exchange-
//                    listed US stocks") and every other market are on Fixed
//                    pricing, as the page says. SEC, TAF and CAT still apply.
//
// The account is in USD; a listing in one of the 22 deposit currencies
// (deposits.mjs) is a remark, "FX 0.03% when cash ≠ CCY." (the auto-
// conversion spread), any other (KRW, TWD, MYR, BRL, SAR, RON, CNY) converts
// both ways at 0.03 % in the total. No consumption tax on a US trade.
// Custody is free. US book: Interactive Brokers LLC's own 606 Q.
//
//   node brokers/ibkrus/ibkrus_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/ibkrus/ibkrus_cost.mjs AAPL XNAS USD --shares=10 --price=230 --plan=lite
//   node brokers/ibkrus/ibkrus_cost.mjs AABB OTCM USD --shares=1000 --price=0.05 --plan=lite
//   node brokers/ibkrus/ibkrus_cost.mjs 7203 XTKS JPY --shares=100 --price=2800
//
// `roundTrip(...)` reads files, not the network.

import { makeIbkrProLite, runCli, PLANS } from "../ibkrca/ibkrca_cost.mjs";

export { PLANS };

const ibkrus = makeIbkrProLite({
  folder: "ibkrus",
  entity: "Interactive Brokers LLC",
  base: "USD",
  page: "https://www.interactivebrokers.com/en/pricing/commissions-stocks.php",
  catalogueUrl: new URL("ibkrus-parsed.json", import.meta.url),
});

export const roundTrip = ibkrus.roundTrip;

runCli(import.meta.url, roundTrip);
