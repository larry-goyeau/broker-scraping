// What one round trip costs at Radiant Credit Union (Gainesville, Florida):
// buy n shares at price p, sell them back at once, online, in regular hours,
// in dollars. US exchange-listed stocks, ETFs and sponsored ADRs in
// Unifimoney's Self-Managed (self-elected) cash account, reached from
// Radiant online and mobile banking. Robo-advisory, digital assets and
// precious metals stay out.
//
// Unifimoney runs the platform; "Brokerage services are offered through
// APEX Clearing and Custody, a registered broker dealer, member of FINRA and
// SIPC" (Radiant's page). Apex Clearing Corporation, CRD 13071. Pages read
// 2026-10-26:
//
//   https://www.radiantcu.org/online-investing
//   https://www.unifimoney.com/invest/self-managed
//   https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf
//     ("Unifimoney Fees & Limits as of 01/29/2026", the schedule shared with
//     Capitol CU and First Fidelity)
//
//   commission       $0 each way: "Unifimoney does not charge a commission on
//                    self-elected trading. However, other charges may apply"
//                    (Radiant); "Trade Commissions on self-elected individual
//                    cash accounts: Free" (Unifimoney schedule)
//   SEC / TAF / CAT  "other charges may apply", "Additional fees may apply,
//                    charged by APEX": no figure printed, so 0 (owner's rule)
//   ACAT out         $50 one-time: not part of the trip
//
// Formula: book (Apex 605 × Q) + 0 + 0.
//
// Routing: Apex is the broker-dealer of record, so a listed US line takes
// Apex's per-symbol 605 × Q (rule606 key "apex"); the Texas Stock Exchange
// lines read the same figure.
//
// Cash is dollars (the member's Radiant account) and every line is in
// dollars: no conversion.
//
//   node brokers/radiantcredituni/radiantcredituni_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/radiantcredituni/radiantcredituni_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Radiant CU (Unifimoney)",
  folder: "radiantcredituni",
  catalogueUrl: new URL("radiantcredituni-parsed.json", import.meta.url),
  url: "https://www.radiantcu.org/online-investing",
  schedule: "https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf",
  readOn: "2026-10-26",
  entity: "Unifimoney (platform), broker-dealer and custody Apex Clearing Corporation (CRD 13071)",
  rule606: "apex",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  remark: "",
  basis:
    "page Radiant relue le 2026-10-26 : « Unifimoney does not charge a commission on self-elected trading » ; " +
    "barème Unifimoney Fees & Limits du 01/29/2026 : « Trade Commissions on self-elected individual cash accounts: Free », " +
    "frais Apex éventuels non chiffrés",
  notes: ["transfert ACAT sortant 50 $ hors trajet"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
