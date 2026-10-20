// What one round trip costs at IBKR for a Swiss resident: buy n shares at
// price p, sell them straight back, online, in dollars.
//
// Which entity. interactivebrokers.ch forwards to interactivebrokers.eu,
// whose page reads (2026-10-19): IBIE serves EU/EEA residents, and
// "Interactive Brokers U.K. Limited (IBUK) serving residents of non-EU/EEA
// European countries (UK, Switzerland)". The funding tool files a Swiss
// resident under the UK entity too (deposits.mjs). IBKR Financial Services
// AG (Zug), the name in broker-list.json, is not the contracting broker.
// So the price list is IBUK's, read on 2026-10-19:
//
//   https://www.interactivebrokers.co.uk/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.co.uk/en/pricing/commissions-spot-currencies.php
//   https://www.interactivebrokers.eu/en/home.php
//
// Its stock tables are word for word the Canadian and Irish ones (IBUK adds
// "UK stamp duty will be applied to all UK share purchases", which taxMap
// carries). The rules, third-party fees, N/A places and FX treatment are
// the ones written out in brokers/ibkrca/ibkrca_cost.mjs, shared through
// `makeIbkr`: Fixed + IB SmartRouting, Tiered only where nothing else is
// printed (Korea, Taiwan, Malaysia, Brazil). The account is in CHF; a
// listing in one of the 25 deposit currencies is a remark ("FX 0.03% when
// cash ≠ CCY."), any other (KRW, TWD, BRL, SAR, CNY) converts both ways at
// the 0.03 % auto-conversion spread, in the total. IBUK is not a Swiss
// securities dealer, so no Swiss transfer stamp. VAT "where applicable" has
// no rate on a trade. Custody is free. US book: Interactive Brokers LLC's
// 606 Q (IBUK's US orders are carried there).
//
//   node brokers/ibkrch/ibkrch_cost.mjs NESN XSWX CHF --shares=10 --price=80
//   node brokers/ibkrch/ibkrch_cost.mjs AAPL XNAS USD --shares=5 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { makeIbkr, runCli } from "../ibkrca/ibkrca_cost.mjs";

const ibkrch = makeIbkr({
  folder: "ibkrch",
  entity: "IBKR (IBUK, résident suisse)",
  base: "CHF",
  page: "https://www.interactivebrokers.co.uk/en/pricing/commissions-stocks.php",
  catalogueUrl: new URL("ibkrch-parsed.json", import.meta.url),
});

export const roundTrip = ibkrch.roundTrip;

runCli(import.meta.url, roundTrip);
