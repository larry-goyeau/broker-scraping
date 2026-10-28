// What one round trip costs in Crews Bank & Trust's Crews Invest (Eko
// Investments inside online and mobile banking), self-directed portfolio:
// buy n shares at price p, sell them back at once, in regular hours, in
// dollars. US stocks and ETFs. Pre-made and hybrid portfolios (0.50% a
// year) are managed products and stay out.
//
// Read 2026-10-26 (FAQ on the same page):
//   https://www.crews.bank/digital-investing
//
//   commission      $0 each way: "A Self-Directed Digital Investing
//                   portfolio is commission-free. We don't charge anything
//                   per trade, or to open or maintain your account."
//   FINRA TAF       "Additional fees, including a FINRA Trading Activity
//                   Fee (TAF), may be charged to your account." The page
//                   names the TAF, so it is on, at FINRA's rate ($0.000195
//                   a share sold, cap $9.79), rounded up to the cent (no
//                   rounding printed). FINRA pauses it for trades from
//                   2026-10-01 to 2026-12-31, so it is $0 today.
//   SEC / CAT       not printed, so 0.
//
// Formula: book (605 × Q) + 0 + TAF on the sale. "Securities and brokerage
// services are offered by Alpaca Securities LLC" (CRD 288202), so a US line
// takes Alpaca's Q (rule606 key "alpaca").
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/crewstrust/crewstrust_cost.mjs US0378331005 XNAS USD --shares=3.8 --price=262
//   node brokers/crewstrust/crewstrust_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Crews Bank & Trust (Crews Invest)",
  folder: "crewstrust",
  catalogueUrl: new URL("crewstrust-parsed.json", import.meta.url),
  url: "https://www.crews.bank/digital-investing",
  readOn: "2026-10-26",
  entity: "Eko Investments, Inc. (adviser), Alpaca Securities LLC (broker-dealer, CRD 288202)",
  rule606: "alpaca",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: "up", cat: false },
  basis:
    "FAQ Crews Invest, relue le 2026-10-26 : « Self-Directed Digital Investing portfolio is commission-free. We don't charge anything per trade », 0 $ à l'achat et à la vente",
  notes: [
    "la FAQ nomme la TAF de la FINRA (« may be charged ») : taux FINRA, arrondi au centime supérieur (arrondi non imprimé)",
    "Eko Investments, courtage Alpaca Securities LLC : Q d'Alpaca",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
