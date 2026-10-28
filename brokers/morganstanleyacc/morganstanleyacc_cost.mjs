// What one round trip costs at Morgan Stanley Access Direct (Morgan Stanley
// Smith Barney LLC, the self-directed account for stock plan participants):
// buy n shares at price p, sell them straight back, online, in dollars.
// US-listed stocks and ETFs. Mutual funds, options and bonds stay out.
//
// "Access Direct Pricing" page read 2026-10-26:
//   https://www.morganstanley.com/what-we-do/wealth-management/morgan-stanley-access-direct/pricing-details
//
//   Online Trading      "Stocks + ETFs $0" ("Price may vary based on
//                       corporate stock plan relationship"): $0 each way
//   Supplemental        "Supplemental Transaction Fee (SEC Transaction Fee)
//   Transaction Fee     Variable/minimum $0.01 per transaction", "May be
//                       applied to the sale of certain securities": the SEC
//                       rate on the sale, nearest cent, never under $0.01
//                       (helper mode "penny")
//   FINRA TAF, CAT      not printed, so 0 (TAF is paused until 2026-12-31
//                       anyway)
//   Representative Assisted Trade Fee "$25 additional per trade": not online,
//                       not this trip
//   ACATS $95, wires, checks, ADR depositary fees ("Varies/per event"): not
//                       on an order
//
// Order limits from the Online Trade Restrictions PDF: purchases "blocked at
// > $500,000 or >25,000 shares", so a bigger buy has no online price.
//   https://www.morganstanley.com/content/dam/msdotcom/what-we-do/wealth-management-master/access-direct/Morgan_Stanley_Online_Trade_Restrictions.pdf
//
// Formula: book + $0 + $0 + SEC on the sale (min $0.01).
//
// Routing: the orders are Morgan Stanley Smith Barney LLC's. It files its
// own 606 (149777_606_NMS_2026_Q2_MSWM in the 2026 Q2 bulk zip; Morgan
// Stanley & Co. LLC, key morganstanleyco, is another firm): key
// `morganstanleysb` in spreads/rule606.mjs, the book is the blended 605 ×
// that 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/morganstanleyacc/morganstanleyacc_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/morganstanleyacc/morganstanleyacc_cost.mjs US4642872000 ARCX USD --shares=1.304 --price=766.67
//   node brokers/morganstanleyacc/morganstanleyacc_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const BUY_LIMIT = { notional: 500_000, shares: 25_000 };

const SCHEDULE = {
  broker: "Morgan Stanley Access Direct",
  folder: "morganstanleyacc",
  catalogueUrl: new URL("morganstanleyacc-parsed.json", import.meta.url),
  url: "https://www.morganstanley.com/what-we-do/wealth-management/morgan-stanley-access-direct/pricing-details",
  restrictions:
    "https://www.morganstanley.com/content/dam/msdotcom/what-we-do/wealth-management-master/access-direct/Morgan_Stanley_Online_Trade_Restrictions.pdf",
  readOn: "2026-10-26",
  entity: "Morgan Stanley Smith Barney LLC",
  rule606: "morganstanleysb",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => ({ buy: 0, sell: 0, note: "Online Trading « Stocks + ETFs $0 »" }),
  levies: { sec: "penny", taf: false, cat: false },
  tradable: (ctx) =>
    ctx.notionalUsd > BUY_LIMIT.notional || ctx.shares > BUY_LIMIT.shares
      ? "achat bloqué en ligne au-delà de 500 000 $ ou 25 000 parts (Online Trade Restrictions)"
      : null,
  basis:
    "page Access Direct Pricing, relue le 2026-10-26 : 0 $ par ordre d'actions ou d'ETF en ligne, " +
    "Supplemental Transaction Fee (SEC) variable, minimum 0,01 $, sur la vente",
  notes: [
    "« Price may vary based on corporate stock plan relationship » : prix public de 0 $ retenu",
    "606 de Morgan Stanley Smith Barney (CRD 149777), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
