// What one round trip costs in a Betterment self-directed investing account
// (Betterment Securities, cleared by Apex Clearing Corporation): buy n
// shares at price p, sell them straight back, online, in dollars. US-listed
// stocks of the S&P 500 and Russell 3000 and ETFs, whole or fractional.
//
// Page read in full 2026-10-26:
//   https://www.betterment.com/self-directed-investing
//
//   "All trades are commission-free."
//   "You'll pay no trading commission fees, and Betterment's management fee
//   doesn't apply." / "Betterment waives its wrap fee on assets in
//   self-directed investing accounts."
//   SEC, TAF, CAT    not printed: 0 (owner rule)
//
// Formula: book + $0 + $0.
//
// Routing: Betterment Securities (CRD 47788) files no 606 of its own. The
// FINRA 606 bulk file, 2026 Q2 adopt-by-reference list, has "47788|BETTERMENT
// SECURITIES|13071|APEX CLEARING CORPORATION" from 2024 Q2. So a US line
// takes Apex's Q (rule606 key "apex").
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Clients must live in the US; cash is dollars and every line is in dollars:
// no conversion.
//
//   node brokers/betterment/betterment_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/betterment/betterment_cost.mjs US9229083632 ARCX USD --shares=1.41 --price=709.175
//   node brokers/betterment/betterment_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Betterment",
  folder: "betterment",
  catalogueUrl: new URL("betterment-parsed.json", import.meta.url),
  url: "https://www.betterment.com/self-directed-investing",
  readOn: "2026-10-26",
  entity: "Betterment Securities",
  crd: "47788",
  clearing: "Apex Clearing Corporation",
  // Betterment Securities adopts Apex's 606 by reference (FINRA bulk file, 2026 Q2).
  rule606: "apex",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  basis:
    "page Betterment self-directed-investing, relue le 2026-10-26 : « All trades are commission-free », frais de gestion levés, " +
    "0 $ à l'achat comme à la vente",
  notes: ["Betterment Securities (CRD 47788) adopte le 606 d'Apex Clearing par référence (FINRA, liste 2026 T2)"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
