// What one round trip costs at Fundvest (Fundvest UAB, Vilnius, a Bank of
// Lithuania brokerage firm; app only): buy n shares at price p, sell them
// back at once, in the app. US company shares (whole or fractional), executed
// by DriveWealth, LLC (best execution policy).
//
// Fee schedule "Version 1.2, valid from 23 April 2026", read 2026-10-26:
//   https://fundvest.eu/fee-schedule/
//   https://fundvest.eu/pricing/
//   https://fundvest.eu/help-center/
//
//   Commission fee per trade    "0.35%": "applies in all cases when you place
//                               an order using Fundvest app" (buy and sell),
//                               no minimum printed
//   Currency conversion fee     "0.50%": "applies only in cases where a
//                               financial instrument that you decide to
//                               purchase is traded in a currency other than
//                               euro"; pricing page: "Not applicable for
//                               transactions with nominal trade values in EUR"
//   USA (SEC Section 31 Fee)    "0.00008% on stock sale transactions (paid by
//                               Fundvest)": not charged to the client, 0
//   TAF / CAT                   not printed: 0 (owner's rule)
//   custody, deposit, withdrawal "No fee"; inactivity EUR 10 a month: not on
//                               an order
//
// Formula: book (DriveWealth 605 × Q) + 0.35% × 2 + FX 0.5% × 2.
// The account is in euros only ("the relevant amount in euros from your
// Fundvest account will be converted"), so the dollar line is converted:
// the owner's rule counts forced FX both ways. The schedule's wording names
// the purchase; the pricing page's "transactions" covers both legs, and the
// sale proceeds come back to the euro account. Help centre example: "the
// cost for investing 1000 € ... 8,5€ for US stocks" (0.35% + 0.5% on the buy).
//
// Routing: "DriveWealth, LLC – LEI: 875500PNFZENVO437436 Stocks (shares) of
// US companies; Fractional Stocks (shares) of US companies", so a listed
// line takes DriveWealth's per-symbol 605 × Q (rule606 key "drivewealth").
//   https://fundvest.eu/best-execution-policy
//
//   node brokers/fundvest/fundvest_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/fundvest/fundvest_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const RATE = 0.0035;

const SCHEDULE = {
  broker: "Fundvest",
  folder: "fundvest",
  catalogueUrl: new URL("fundvest-parsed.json", import.meta.url),
  url: "https://fundvest.eu/fee-schedule/",
  readOn: "2026-10-26",
  entity: "Fundvest UAB (Bank of Lithuania), US execution DriveWealth, LLC",
  rule606: "drivewealth",
  cash: "EUR",
  deposits: ["EUR"],
  feeCurrency: "USD",
  ticket: (ctx) => {
    if (ctx.notionalUsd == null) return null;
    const leg = RATE * ctx.notionalUsd;
    return { buy: leg, sell: leg, note: `0,35 % par ordre, sans minimum : ${leg.toFixed(4)} $ à l'achat et à la vente` };
  },
  levies: { sec: false, taf: false, cat: false },
  fx: { rate: 0.005, label: "0.5" },
  remark: "",
  basis:
    "barème Fundvest v1.2 (23 avril 2026), relu le 2026-10-26 : « Commission fee per trade 0.35% », " +
    "« Currency conversion fee 0.50% » hors euro",
  notes: [
    "SEC Section 31 « paid by Fundvest » : 0 pour le client",
    "compte en euros seulement : change 0,5 % compté à l'achat et à la vente (le barème cite l'achat, la page Pricing les « transactions »)",
    "exécution US par DriveWealth, LLC (politique d'exécution) : 605 × Q de DriveWealth",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
