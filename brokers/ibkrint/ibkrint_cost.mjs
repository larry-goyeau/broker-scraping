// What one round trip costs at Interactive Brokers LLC for a client who is
// not a US resident and whose country has no IBKR company of its own (Latin
// America, Africa, the Middle East, most of Asia: accepted.mjs): buy n
// shares at price p, sell them straight back, online, in dollars.
//
// Same company and same price list as ibkrus, read on 2026-10-20:
//
//   https://www.interactivebrokers.com/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.com/en/pricing/commissions-spot-currencies.php
//
// IBKR Lite is "available to US residents" only, so this row is IBKR Pro
// Fixed + IB SmartRouting, with the rules, third-party fees, N/A places and
// FX treatment written out in brokers/ibkrca/ibkrca_cost.mjs (`makeIbkr`).
// The account base is USD. The funding tool gives a non-US resident the same
// wire currencies as a US one (colr=BRA, MEX, ZAF, ARE, CHN, MYS, NZL read
// 2026-10-21), so a listing in one of them is a remark ("FX 0.03% when
// cash ≠ CCY."); any other converts both ways at 0.03 %, in the total. US
// book: Interactive Brokers LLC's own 606 Q.
//
//   node brokers/ibkrint/ibkrint_cost.mjs AAPL XNAS USD --shares=5 --price=230
//   node brokers/ibkrint/ibkrint_cost.mjs CSPX XLON USD --shares=2 --price=700

import { makeIbkr, runCli } from "../ibkrca/ibkrca_cost.mjs";

const ibkrint = makeIbkr({
  folder: "ibkrint",
  entity: "Interactive Brokers LLC (non-US resident)",
  base: "USD",
  page: "https://www.interactivebrokers.com/en/pricing/commissions-stocks.php",
  catalogueUrl: new URL("ibkrint-parsed.json", import.meta.url),
});

export const roundTrip = ibkrint.roundTrip;

runCli(import.meta.url, roundTrip);
