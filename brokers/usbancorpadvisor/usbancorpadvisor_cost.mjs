// What one round trip costs at U.S. Bancorp Advisors Self-Directed
// Investing: buy n shares at price p, sell them straight back, online
// (usbank.com or the U.S. Bank app), in dollars. US-listed stocks, ETFs,
// ETNs and closed-end funds. Options and funds stay out.
//
// Fee page read in full 2026-10-26:
//   https://www.usbank.com/investing/online-investing/self-directed-investing/fees.html
//
//   online                 "Equities, exchange-traded funds (ETF) and closed-end funds: $0"
//   Client Service Center  "$25 for Brokerage Service Associate assistance plus online
//                          commission rate" (not this trip: online only)
//   regulatory fee         "sales of equities and ETFs are subject to a regulatory
//                          transaction fee, which appears on trade confirmation as the
//                          'Activity Assessment Fee'". No rate printed: the SEC's rate,
//                          rounded up to the cent. TAF and CAT not named, 0
//   safekeeping $15/month  physical certificates, not a market position: left out
//   wires $30, transfer $100, foreign securities $75 (not this place)
//
// Formula: book (quoted NBBO × shares) + $0 + SEC on the sale.
//
// Routing: U.S. Bancorp Advisors, LLC (CRD 14455) files its own 606 (FINRA
// 606 bulk 2026 Q2, 14455_606_NMS_2026_Q2_V1); clearing and custody at
// National Financial Services (CRD 13041). Key `usbancorpadvisors`
// in spreads/rule606.mjs: the book is the blended 605 × that 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/usbancorpadvisor/usbancorpadvisor_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/usbancorpadvisor/usbancorpadvisor_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "U.S. Bancorp Advisors",
  folder: "usbancorpadvisor",
  catalogueUrl: new URL("usbancorpadvisor-parsed.json", import.meta.url),
  url: "https://www.usbank.com/investing/online-investing/self-directed-investing/fees.html",
  readOn: "2026-10-26",
  entity: "U.S. Bancorp Advisors, LLC",
  crd606: "14455",
  clearing: "National Financial Services LLC",
  rule606: "usbancorpadvisors",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: false, cat: false },
  basis:
    "barème U.S. Bancorp Advisors Self-Directed Investing, relu le 2026-10-26 : 0 $ par ordre d'actions, " +
    "d'ETF ou de fonds fermés en ligne",
  notes: [
    "« Activity Assessment Fee » sur les ventes, sans taux imprimé : comptée 0",
    "606 de U.S. Bancorp Advisors (CRD 14455), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
