// What one round trip costs at Frec (frec.com) in a self-managed
// portfolio: buy n shares at price p, sell them back at once, online, in
// dollars. US-listed shares, ADRs, ETFs and ETNs (see frec_scraping.mjs).
// Direct indexing, Treasury, mutual funds and the line of credit stay out.
//
// Frec Securities LLC (CRD 316641), clearing and custody at Apex Clearing
// Corporation. Pricing & Fee Schedule "Effective October 01, 2026", read in
// full 2026-10-26:
//
//   https://docs.frec.com/pricing-fee-schedule.pdf
//
//   commission        "Commission fee/Markups $0"
//   SEC               "$20.60 per million for covered sales", footnote:
//                     "rounded up to the nearest penny"
//   FINRA TAF         "Shares sold x $0.000195 with a maximum of $9.79 per
//                     trade", footnote: "The fee is waived Oct 1, 2026-Dec
//                     31,2026". The helper puts it at 0 in that window and
//                     rounds it up to the cent after (no rounding printed).
//   CAT               not printed, so 0
//   ACATS out $75, outgoing wire $25, rights/tender exercise $50: not on
//   an order, left out.
//
// Formula: book (605 × Q) + 0 commission + SEC on the sale (rounded up) +
// TAF on the sale (0 until 2026-12-31).
//
// Routing: the FINRA 606 bulk file, 2026 Q2 adopt-by-reference list, has
// "316641|FREC SECURITIES LLC|13071|APEX CLEARING CORPORATION" from 2024
// Q2, so a listed line takes Apex's 605 × Q (rule606 key "apex"). The Texas
// Stock Exchange lines read the same per-symbol 605.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars only (ACH and domestic wires), every line is in dollars:
// no conversion.
//
//   node brokers/frec/frec_cost.mjs AAPL XNAS USD --shares=3.8 --price=262
//   node brokers/frec/frec_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Frec",
  folder: "frec",
  catalogueUrl: new URL("frec-parsed.json", import.meta.url),
  url: "https://docs.frec.com/pricing-fee-schedule.pdf",
  readOn: "2026-10-26",
  effective: "2026-10-01",
  entity: "Frec Securities LLC (CRD 316641), clearing Apex Clearing Corporation",
  rule606: "apex",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis: "barème Frec (en vigueur le 2026-10-01), relu le 2026-10-26 : « Commission fee/Markups $0 », SEC et TAF répercutées",
  notes: ["Frec Securities adopte le 606 d'Apex Clearing par référence (bulk FINRA 2026 T2)"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
