// What one round trip costs at Central National Bank (Kansas) Digital
// Investing: buy n shares at price p, sell them back at once, online, in
// regular hours, in dollars. US exchange-listed stocks and ETFs in the
// Self-Directed portfolio, reached from CNB online and mobile banking.
// Pre-built and hybrid portfolios (0.50% a year) stay out.
//
// Eko Investments, Inc. (SEC registered adviser) runs the platform;
// "Brokerage services are provided to clients by Alpaca Securities LLC, an
// SEC registered broker-dealer and member FINRA." Pages read 2026-10-26:
//
//   https://centralnational.com/whycentral/digital-investing.asp
//   https://eko.investments/legal/InvestmentManagementAgreement.pdf
//
//   commission     $0 each way: "Self-Directed Investing is commission-free.
//                  We don't charge anything per trade, or to open and
//                  maintain your account." Self-directed portfolios "are not
//                  assessed a Management Fee"
//   SEC / TAF / CAT  not printed by CNB, Eko or in the agreement, so 0
//                  (owner's rule)
//   minimum        "The minimal funding amount is $10."
//   crypto         1% Crypto Transaction Fee (agreement): not this trip
//
// Formula: book (Alpaca 605 × Q) + 0 + 0.
//
// Routing: Alpaca Securities LLC is the broker-dealer of record, so a
// listed US line takes Alpaca's per-symbol 605 × Q (rule606 key "alpaca");
// the Texas Stock Exchange lines read the same figure. The agreement says
// Eko may "batch" client orders; the trip still prices one order.
//
// Cash is dollars (the Digital Investing account, funded from CNB) and every
// line is in dollars: no conversion.
//
//   node brokers/centralnational/centralnational_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/centralnational/centralnational_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Central National Bank (Eko)",
  folder: "centralnational",
  catalogueUrl: new URL("centralnational-parsed.json", import.meta.url),
  url: "https://centralnational.com/whycentral/digital-investing.asp",
  readOn: "2026-10-26",
  entity: "Eko Investments, Inc. (platform), broker-dealer Alpaca Securities LLC",
  rule606: "alpaca",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  remark: "",
  basis:
    "page Digital Investing de Central National Bank relue le 2026-10-26 : « Self-Directed Investing is commission-free. " +
    "We don't charge anything per trade », courtier Alpaca Securities, frais réglementaires non chiffrés",
  notes: ["dépôt minimum 10 $", "portefeuilles pré-construits et hybrides 0,50 %/an, hors self-directed"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
