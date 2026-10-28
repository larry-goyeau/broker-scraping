// What one round trip costs at Yulie Sekuritas Indonesia through
// YOUTRADE: buy n shares (or ETF units) on the Indonesia Stock Exchange,
// sell them back at once, in dollars. The online account.
//
// https://youtrade.yuliesekuritas.com/ read on 2026-10-26:
//   "Commission Fee 0.15% Buy 0.25% Sell"
//   "Fee already includes Broker fee, BEI, KPEI, KSEI,fee PPN Broker, dan
//    PPh"
//   FAQ: "a commission fee of 0.15% from the total transaction for Buy and
//   0.25% for the sell transaction. This commission fee includes Broker
//   fee, IDX fees, KSEI fees, Value Added Tax (VAT) and Income Tax (PPh)."
// So both figures are all-in: broker fee, VAT, the 0.0433% levy, and on
// the sell the 0.1% final income tax. No floor, no ETF rate and no
// e-Meterai are printed, so none is added.
//
// fees = notional x (0.15% + 0.25%).
// The account is in rupiah (RDN at an Indonesian bank), so there is no FX
// leg. The book comes from spreads/ (spreads/idx-touch.mjs). The sums are
// in ../stockbit/idxCost.mjs.
//
//   node brokers/yulie/yulie_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Yulie Sekuritas",
  folder: "yulie",
  catalogueUrl: new URL("yulie-parsed.json", import.meta.url),
  url: "https://youtrade.yuliesekuritas.com/",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte YOUTRADE, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
