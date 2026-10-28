// What one round trip costs at First Fidelity Bank (Oklahoma): buy n shares at
// price p, sell them back at once, online, in regular hours, in dollars. US
// exchange-listed stocks, ETFs and sponsored ADRs in Unifimoney's
// Self-Managed (self-elected) cash account, reached from GoBankFFB online
// banking. Robo-advisory (0.30% a year), crypto (Gemini) and precious metals
// (GBI) stay out.
//
// Unifimoney RIA QOZB, LLC runs the platform; the broker-dealer, clearing and
// custody is Apex Clearing Corporation (CRD 13071): "Brokerage account
// services are offered through Apex Clearing and Custody, Inc.", "charged by
// APEX (Broker/Dealer)". Pages read 2026-10-26:
//
//   https://www.ffb.com/unifimoney
//   https://www.unifimoney.com/invest/self-managed
//   https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf
//     ("Unifimoney Fees & Limits as of 01/29/2026", linked as "Fee schedule"
//     from https://www.unifimoney.com/legal)
//
//   commission     $0 each way: "Self-Managed: Enables you to trade
//                  commission-free when you want" (FFB); "Trade Commissions on
//                  self-elected individual cash accounts: Free" (schedule)
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
// Cash is dollars (Unifimoney's Cash Account is held at First Fidelity Bank)
// and every line is in dollars: no conversion.
//
//   node brokers/firstfidelity/firstfidelity_cost.mjs AAPL XNAS USD --shares=2.876 --price=347.725
//   node brokers/firstfidelity/firstfidelity_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "First Fidelity Bank (Unifimoney)",
  folder: "firstfidelity",
  catalogueUrl: new URL("firstfidelity-parsed.json", import.meta.url),
  url: "https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf",
  page: "https://www.ffb.com/unifimoney",
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
