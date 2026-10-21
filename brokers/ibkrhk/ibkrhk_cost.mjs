// What one round trip costs at Interactive Brokers Hong Kong: buy n shares
// at price p, sell them straight back, online, in dollars.
//
// Interactive Brokers Hong Kong Limited (SFC licensed, SEHK and HKFE
// member) serves Hong Kong residents; the .com.hk site sends any other
// Asian resident (bar India and Japan) to Interactive Brokers LLC. The
// price list is the Hong Kong page, read on 2026-10-20:
//
//   https://www.interactivebrokers.com.hk/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.com.hk/en/pricing/commissions-spot-currencies.php
//
// Its stock tables are word for word the Canadian ones (only the footnote
// numbers move), so the rules, third-party fees, N/A places and FX
// treatment are those written out in brokers/ibkrca/ibkrca_cost.mjs, shared
// through `makeIbkr` with no override: Fixed + IB SmartRouting, Tiered only
// where nothing else is printed (Korea, Taiwan, Malaysia, Brazil).
//
//   Hong Kong        0.08 %, min HKD 18 / USD 2.25 / CNH 15; SFC 0.0027 %,
//                    FRC 0.00015 % a side, stamp 0.1 % a side on a stock.
//   Stock Connect    0.08 %, min CNH 15; stamp 0.05 % on a stock sale.
//   United States    USD 0.005 a share, min 1, max 1 %; SEC, CAT; TAF 0
//                    (FINRA fee holiday 1 Oct - 31 Dec 2026).
//   Europe, Canada, Japan, Australia, Singapore ... as on ibkrca.
//   Not on the card (N/A): Helsinki, Euronext Dublin, Johannesburg.
//
// The page's line on "Goods and services tax (currently 9%, ... Inland
// Revenue Authority of Singapore)" is the Singapore entity's boilerplate;
// Hong Kong levies no GST, so nothing is added. Custody is free.
//
// FX: the funding tool lists 20 deposit currencies (deposits.mjs, HKD
// domestic). A listing in one of them is a remark, the 0.03 % auto-
// conversion spread ("FX 0.03% when cash ≠ CCY."); any other (KRW, TWD,
// MYR, BRL, SAR, AED, RON) converts both ways at 0.03 %, in the total. US
// book: Interactive Brokers LLC's 606 Q (it carries the group's US orders).
//
//   node brokers/ibkrhk/ibkrhk_cost.mjs 700 XHKG HKD --shares=100 --price=500
//   node brokers/ibkrhk/ibkrhk_cost.mjs AAPL XNAS USD --shares=5 --price=230
//   node brokers/ibkrhk/ibkrhk_cost.mjs 005930 XKRX KRW --shares=10 --price=70000
//
// `roundTrip(...)` reads files, not the network.

import { makeIbkr, runCli } from "../ibkrca/ibkrca_cost.mjs";

export const READ_ON = "2026-10-20";

const ibkrhk = makeIbkr({
  folder: "ibkrhk",
  entity: "Interactive Brokers Hong Kong",
  base: "HKD",
  page: "https://www.interactivebrokers.com.hk/en/pricing/commissions-stocks.php",
  catalogueUrl: new URL("ibkrhk-parsed.json", import.meta.url),
});

export const roundTrip = ibkrhk.roundTrip;

runCli(import.meta.url, roundTrip);
