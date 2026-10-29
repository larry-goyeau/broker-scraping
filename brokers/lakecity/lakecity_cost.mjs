// What one round trip costs in Lake City Bank's Digital Investing (Eko
// Investments inside Lake City Bank Digital), self-directed portfolio: buy
// n shares at price p, sell them back at once, in regular hours, in
// dollars. US stocks and ETFs, fractional shares included, from $1 a
// trade. Pre-made and hybrid portfolios (0.40% yearly wrap fee) are managed
// products and stay out.
//
// Read 2026-10-26:
//   https://www.lakecitybank.com/personal/digital-banking/digital-investing/
//
//   commission      $0 each way: the self-directed column, "Cost to
//                   invest: No cost"; FAQ: "Investing is commission-free.
//                   There is no charge per trade, or to open or maintain
//                   your account."
//   SEC / TAF / CAT Alpaca's Broker Fee Schedule passes them to the
//                  account: SEC $0.0000206 of the sale, TAF on the shares
//                  sold, CAT $0.000003 a share each leg (OTC 1:0.01). Eko's
//                  agreement: the client "may incur certain charges imposed
//                  by custodians". Rounded up to the cent, as Alpaca does
//                  (alpaca_cost.mjs). Read 2026-10-28.
//                  https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf
//
// Formula: book (605 × Q) + 0 + SEC, TAF and CAT. "Brokerage services are provided to
// clients by Alpaca Securities LLC" (CRD 288202), so a US line takes
// Alpaca's Q (rule606 key "alpaca").
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/lakecity/lakecity_cost.mjs US0378331005 XNAS USD --shares=3.8 --price=262
//   node brokers/lakecity/lakecity_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Lake City Bank (Digital Investing)",
  folder: "lakecity",
  catalogueUrl: new URL("lakecity-parsed.json", import.meta.url),
  url: "https://www.lakecitybank.com/personal/digital-banking/digital-investing/",
  readOn: "2026-10-26",
  entity: "Eko Investments, Inc. (adviser), Alpaca Securities LLC (broker-dealer, CRD 288202)",
  rule606: "alpaca",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: { perShare: 0.000003, otcPerShare: 0.00000003, mode: "up" } },
  basis:
    "page Digital Investing de Lake City Bank, relue le 2026-10-26 : autogéré « No cost », « There is no charge per trade », 0 $ à l'achat et à la vente",
  notes: ["Eko Investments, courtage Alpaca Securities LLC : Q d'Alpaca"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
