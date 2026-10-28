// What one round trip costs in Casco Federal Credit Union's CascoINVEST
// (Eko Investments inside online and mobile banking), self-directed
// portfolio: buy n shares at price p, sell them back at once, in regular
// hours, in dollars. US stocks and ETFs, fractional shares included.
// Hybrid and pre-built portfolios (0.5% a year) are managed products and
// stay out.
//
// Read 2026-10-26 (FAQ on the same page):
//   https://www.cascofcu.com/additional-services/cascoinvest#CascoINVEST_FAQ
//
//   commission      $0 each way: "A Self-Directed CascoINVEST portfolio is
//                   commission-free. We don't charge anything per trade, or
//                   to open or maintain your account."
//   SEC / TAF / CAT not printed, so 0.
//
// Formula: book (605 × Q) + 0 + 0. Eko's legal page: "Brokerage services
// are provided to clients by Alpaca Securities LLC" (CRD 288202), so a US
// line takes Alpaca's Q (rule606 key "alpaca").
//   https://eko.investments/legal
//
// Cash is dollars and every line is in dollars: no conversion. Deposits and
// withdrawals are "free of charge".
//
//   node brokers/cascofederalcred/cascofederalcred_cost.mjs US0378331005 XNAS USD --shares=3.8 --price=262
//   node brokers/cascofederalcred/cascofederalcred_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Casco Federal Credit Union (CascoINVEST)",
  folder: "cascofederalcred",
  catalogueUrl: new URL("cascofederalcred-parsed.json", import.meta.url),
  url: "https://www.cascofcu.com/additional-services/cascoinvest#CascoINVEST_FAQ",
  readOn: "2026-10-26",
  entity: "Eko Investments, Inc. (adviser), Alpaca Securities LLC (broker-dealer, CRD 288202)",
  rule606: "alpaca",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  basis:
    "FAQ CascoINVEST, relue le 2026-10-26 : « Self-Directed CascoINVEST portfolio is commission-free. We don't charge anything per trade », 0 $ à l'achat et à la vente",
  notes: ["Eko Investments, courtage Alpaca Securities LLC : Q d'Alpaca"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
