// What one round trip costs at Plynk (Digital Brokerage Services LLC, a
// Fidelity Investments company; custody and clearing at Green Pier Fintech
// LLC): buy n shares at price p, sell them straight back, in the app, in
// dollars. US-listed stocks, ETFs and ETNs. Mutual funds and crypto stay
// out.
//
// Fee schedule read in full 2026-10-26:
//   https://www.plynkinvest.com/disclosures/fee-schedule
//
//   Commission               "$0" ("Trade stocks and funds with no fees or commissions")
//   Activity Assessment Fee  "charged on all sell orders ... typically ranges from $0.01
//                            to $0.04 per $1,000", set by DBS "in its sole and exclusive
//                            discretion" to pay SRO fees. A discretionary range: the
//                            max, $0.04 per $1,000 of the sale (owner rule), nearest
//                            cent (no rounding printed). It is the whole SRO pass-
//                            through (its footnote quotes the SEC's $20.60 per
//                            million), so SEC, TAF and CAT are not added again
//   Plynk Premium            "$3.99 per month for access to premium benefits": the
//                            trade price is the same, so no plan
//   wire $15, TOA $75        not on an order
//
// Formula: book (quoted NBBO × shares) + $0 on the buy + 0.00004 × sale
// (nearest cent) on the sell.
//
// Routing: Digital Brokerage Services LLC (CRD 308213) files its own 606
// (FINRA 606 bulk 2026 Q2, 308213_606_NMS_2026_Q2_DIBS). Key
// `digitalbrokerage` in spreads/rule606.mjs: the book is the blended 605 ×
// that 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion. Plynk buys in
// dollars, so the share count is usually fractional; the fee does not change.
//
//   node brokers/plynk/plynk_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/plynk/plynk_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli, cents } from "../wellstrade/usCost.mjs";

const ASSESSMENT = { min: 0.01 / 1000, max: 0.04 / 1000 };

const SCHEDULE = {
  broker: "Plynk",
  folder: "plynk",
  catalogueUrl: new URL("plynk-parsed.json", import.meta.url),
  url: "https://www.plynkinvest.com/disclosures/fee-schedule",
  readOn: "2026-10-26",
  entity: "Digital Brokerage Services LLC",
  crd606: "308213",
  clearing: "Green Pier Fintech LLC",
  rule606: "digitalbrokerage",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  assessment: ASSESSMENT,
  ticket: (ctx) => {
    if (ctx.notionalUsd == null) return null;
    const sell = cents(ctx.notionalUsd * ASSESSMENT.max, "nearest");
    return {
      buy: 0,
      sell,
      note: `Activity Assessment Fee à la vente : 0,04 $ par 1 000 $ (haut de la fourchette 0,01–0,04 $), ${sell} $`,
    };
  },
  levies: { sec: false, taf: false, cat: false },
  basis: "barème Plynk (Brokerage Fee/Commission Schedule), relu le 2026-10-26 : 0 $ de commission sur actions et fonds",
  notes: [
    "l'Activity Assessment Fee couvre les frais des SRO (SEC comprise) : SEC, TAF et CAT non ajoutées en plus",
    "606 de Digital Brokerage Services (CRD 308213), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
