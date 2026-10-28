// What one round trip costs at BusyKid (busykid.com): buy n shares at price
// p, sell them back at once, online in the app, in dollars. US-listed
// shares and ETFs (the whole US exchange book, see busykid_scraping.mjs).
//
// Brokerage is provided by Apex Fintech Brokerage Services, LLC (CRD
// 305818) and Apex Clearing Corporation (CRD 13071). Page re-read
// 2026-10-26:
//
//   https://busykid.com/investing-for-kids/
//     "$0 commissions to purchase or sell stocks"
//     "there are no commissions when buying or selling stocks"
//     "For as little as $10, they can invest" (fractional orders)
//   https://busykid.com/pricing/
//     "For only $4/mo. (billed annually)" (the BusyKid subscription)
//
//   commission       $0 each way
//   SEC, TAF, CAT    no figure printed, so 0 (owner rule)
//   subscription     $4 a month billed annually: remark, not in the total
//
// Formula: book (605 × Q) + 0 + 0.
//
// Routing: the page names two dealers. Apex Fintech Brokerage Services
// files its own 606 (2026 Q2, file 305818_606_NMS_2026_Q2_APEX_X82K: 100%
// of held orders to Virtu Americas in April, May and June empty). Apex
// Clearing files its own (13071). When a broker names several US dealers,
// the rule is the highest Q, so a listed line takes Apex Clearing's 605 × Q
// (rule606 key "apex", Q 1.70 against Virtu's 1.03). The Texas Stock
// Exchange lines read the same per-symbol 605.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars only (a US account funded from a US bank), and every line
// is in dollars, so there is no conversion.
//
//   node brokers/busykid/busykid_cost.mjs AAPL XNAS USD --shares=3.8 --price=262
//   node brokers/busykid/busykid_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "BusyKid",
  folder: "busykid",
  catalogueUrl: new URL("busykid-parsed.json", import.meta.url),
  url: "https://busykid.com/investing-for-kids/",
  pricing: "https://busykid.com/pricing/",
  readOn: "2026-10-26",
  entity: "Apex Fintech Brokerage Services, LLC (CRD 305818), clearing Apex Clearing Corporation (CRD 13071)",
  rule606: "apex",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  remark: "$4/month subscription (billed annually).",
  basis: "page BusyKid relue le 2026-10-26 : « $0 commissions to purchase or sell stocks »",
  notes: [
    "abonnement BusyKid 4 $/mois facturé à l'année, hors trajet",
    "deux courtiers nommés (Apex Fintech Brokerage Services, Apex Clearing) : le Q le plus haut, celui d'Apex Clearing",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
