// What one round trip costs at Wealthfront's Brokerage Account (Wealthfront
// Brokerage LLC): buy n shares at price p, sell them straight back, online,
// in dollars. US-listed stocks, ETFs and REITs, whole or fractional.
//
// Read in full 2026-10-26:
//   https://www.wealthfront.com/stock-investing
//   https://support.wealthfront.com/hc/en-us/articles/13992378758676-Understanding-Wealthfront-fees   (updated 2026-10-16)
//   https://support.wealthfront.com/hc/en-us/articles/115002147546   (606 and 605)
//
//   "Brokerage Account and Stock Investing Account: Free. Wealthfront does
//   not charge clients any fees, including account fees or commissions."
//   "Wealthfront does not charge any account-opening fees, withdrawal or
//   account-closing fees, trading/commission fees, or account transfer fees."
//   SEC, TAF, CAT    not printed: 0 (owner rule)
//
// Formula: book + $0 + $0.
//
// Routing: Wealthfront Brokerage LLC (CRD 153407) files its own 606 (FINRA
// 606 bulk 2026 Q2, 153407_606_NMS_2026_Q2_WLTH: Citadel, Virtu, GTS, HRT;
// "does not accept Payment for Order Flow"). Key `wealthfrontbrokerage` in
// spreads/rule606.mjs: the book is the blended 605 × that 606's Q.
//
// Clients must live in the US; cash is dollars and every line is in dollars:
// no conversion.
//
//   node brokers/wealthfront/wealthfront_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/wealthfront/wealthfront_cost.mjs US9229083632 ARCX USD --shares=1.41 --price=709.175
//   node brokers/wealthfront/wealthfront_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Wealthfront",
  folder: "wealthfront",
  catalogueUrl: new URL("wealthfront-parsed.json", import.meta.url),
  url: "https://support.wealthfront.com/hc/en-us/articles/13992378758676-Understanding-Wealthfront-fees",
  readOn: "2026-10-26",
  entity: "Wealthfront Brokerage LLC",
  crd606: "153407",
  rule606: "wealthfrontbrokerage",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  basis:
    "article d'aide Wealthfront « Understanding Wealthfront fees » (mis à jour le 2026-10-16), relu le 2026-10-26 : " +
    "compte Brokerage gratuit, aucune commission à l'achat ni à la vente",
  notes: ["606 de Wealthfront Brokerage (CRD 153407), 2026 T2"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
