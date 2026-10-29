// What one round trip costs at Parda Federal Credit Union (Michigan): buy n
// shares at price p, sell them back at once, online, in regular hours, in
// dollars. US exchange-listed stocks, ETFs and sponsored ADRs in
// Unifimoney's Self-Managed (self-elected) cash account, reached from Parda
// online and mobile banking. Robo-advisory (0.30% a year), crypto (Gemini)
// and precious metals (GBI) stay out.
//
// Unifimoney RIA QOBZ, LLC runs the platform; "Brokerage services ... by
// Apex Clearing & Custody, Inc., member FINRA/SIPC" (the Parda page), the
// schedule's "Self-Elected Trading (powered by APEX)". Pages read
// 2026-10-26:
//
//   https://www.parda.com/invest
//   https://www.unifimoney.com/invest/self-managed
//   https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf
//     ("Unifimoney Fees & Limits as of 01/29/2026", linked as "Fee schedule"
//     from https://www.unifimoney.com/legal)
//
//   commission     $0 each way: "Trade Commissions on self-elected individual
//                  cash accounts: Free"; "$0 commission online trading of U.S.
//                  listed stocks and ETFs (other fees may apply)"
//   SEC / TAF / CAT  SEC and TAF added at the regulators' rates on the sale,
//                    rounded up to the cent ("Additional fees may apply,
//                    charged by APEX (Broker/Dealer)"; owner, 2026-10-28).
//                    CAT: no rate printed, 0.
//   ACAT out       $50 one-time: not part of the trip
//   minimum        "Invest in fractional or full shares with as little as $5"
//
// Formula: book (Apex 605 × Q) + 0 + SEC and TAF on the sale.
//
// Routing: Apex is the broker-dealer of record, so a listed US line takes
// Apex's per-symbol 605 × Q (rule606 key "apex"); the Texas Stock Exchange
// lines read the same figure.
//
// Cash is dollars (Unifimoney's Cash Account at First Fidelity Bank, funded
// from the Parda account) and every line is in dollars: no conversion.
//
//   node brokers/pardafederalcred/pardafederalcred_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/pardafederalcred/pardafederalcred_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Parda FCU (Unifimoney)",
  folder: "pardafederalcred",
  catalogueUrl: new URL("pardafederalcred-parsed.json", import.meta.url),
  url: "https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf",
  page: "https://www.parda.com/invest",
  readOn: "2026-10-26",
  entity: "Unifimoney (platform), broker-dealer and custody Apex Clearing Corporation (CRD 13071)",
  rule606: "apex",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  remark: "",
  basis:
    "barème Unifimoney Fees & Limits du 01/29/2026 relu le 2026-10-26 : « Trade Commissions on self-elected individual cash accounts: Free », frais Apex éventuels non chiffrés",
  notes: ["achat minimum 5 $", "transfert ACAT sortant 50 $ hors trajet"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
