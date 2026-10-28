// What one round trip costs at Farmers Bank & Trust (FB&T, Arkansas): buy n
// shares at price p, sell them back at once, online, in regular hours, in
// dollars. US exchange-listed stocks, ETFs and sponsored ADRs in
// Unifimoney's Self-Managed (self-elected) cash account, reached from
// MyFarmers Online and Mobile Banking. Robo-advisory (0.30% a year), crypto
// (Gemini) and precious metals (GBI) stay out.
//
// Unifimoney RIA QOBZ, LLC runs the platform; "Brokerage services ... by
// Apex Clearing & Custody, Inc., member FINRA/SIPC" (the FB&T page), the
// schedule's "Self-Elected Trading (powered by APEX)". Pages read
// 2026-10-26:
//
//   https://www.myfarmers.bank/unifimoney
//   https://www.unifimoney.com/invest/self-managed
//   https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf
//     ("Unifimoney Fees & Limits as of 01/29/2026", linked as "Fee schedule"
//     from https://www.unifimoney.com/legal)
//
//   commission     $0 each way: "Trade Commissions on self-elected individual
//                  cash accounts: Free"; "$0 commission online trading of U.S.
//                  listed stocks and ETFs (other fees may apply)"
//   SEC / TAF / CAT  "Additional fees may apply, charged by APEX
//                  (Broker/Dealer)": no figure printed, so 0 (owner's rule)
//   ACAT out       $50 one-time: not part of the trip
//   minimum        "Invest in fractional or full shares with as little as $5"
//
// Formula: book (Apex 605 × Q) + 0 + 0.
//
// Routing: Apex is the broker-dealer of record, so a listed US line takes
// Apex's per-symbol 605 × Q (rule606 key "apex"); the Texas Stock Exchange
// lines read the same figure.
//
// Cash is dollars (Unifimoney's Cash Account at First Fidelity Bank, funded
// from the FB&T account) and every line is in dollars: no conversion.
//
//   node brokers/farmerstrust/farmerstrust_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/farmerstrust/farmerstrust_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Farmers Bank & Trust (Unifimoney)",
  folder: "farmerstrust",
  catalogueUrl: new URL("farmerstrust-parsed.json", import.meta.url),
  url: "https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf",
  page: "https://www.myfarmers.bank/unifimoney",
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
    "barème Unifimoney Fees & Limits du 01/29/2026 relu le 2026-10-26 : « Trade Commissions on self-elected individual cash accounts: Free », frais Apex éventuels non chiffrés",
  notes: ["achat minimum 5 $", "transfert ACAT sortant 50 $ hors trajet"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
