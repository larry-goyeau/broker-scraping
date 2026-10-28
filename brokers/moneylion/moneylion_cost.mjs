// What one round trip costs in MoneyLion's Active Investing account: buy n
// shares at price p, sell them back at once, in the app, in regular hours,
// in dollars. The 700-odd US stocks and ETFs of the catalogue, whole or
// fractional. The Managed Investing account stays out.
//
// Read 2026-10-26 (help article last updated 2026-07-07):
//   https://help.moneylion.com/en_us/what-is-the-active-investing-account-HkzEeeggkx.md
//   https://www.moneylion.com/investing/
//   https://moneylion.nyc3.cdn.digitaloceanspaces.com/pdf/ML-Wealth-LLC-CRS-ADV-Brochure-05.26.pdf
//     (Form ADV of ML Wealth LLC, 05.26, via moneylion.com/adv)
//
//   commission      $0 each way: "No trading fees: ... No hidden fees when
//                   buying or selling stocks and ETFs"; the investing page
//                   says "all with zero commission fees".
//   SEC / TAF / CAT not printed by MoneyLion, so 0 (owner's rule; DriveWealth
//                   can pass them through, MoneyLion does not say it does).
//   monthly fee     only the Managed Investing account has one ($1 to $5 a
//                   month); the ADV says "MLW does not charge an Account Fee
//                   for Active Investing Accounts" and "Brokerage execution
//                   fees are paid by MLW".
//
// Formula: book (605 × Q) + 0 + 0. Advisory by ML Wealth LLC; execution and
// custody at DriveWealth, LLC (CRD 165429): the ADV says trades "are
// generally expected to be executed by DriveWealth within seconds" and
// names DriveWealth as the clearing partner, so a listed US line takes
// DriveWealth's Q ("drivewealth" in spreads/rule606.mjs). The TXSE dual
// listings read the same per-symbol 605.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/moneylion/moneylion_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/moneylion/moneylion_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "MoneyLion",
  folder: "moneylion",
  catalogueUrl: new URL("moneylion-parsed.json", import.meta.url),
  url: "https://help.moneylion.com/en_us/what-is-the-active-investing-account-HkzEeeggkx",
  readOn: "2026-10-26",
  entity: "ML Wealth LLC (advisory), DriveWealth, LLC (execution, custody)",
  rule606: "drivewealth",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  basis:
    "aide MoneyLion « What is the Active Investing account? » (mise à jour le 2026-07-07), relue le 2026-10-26 : " +
    "« No trading fees », aucun frais à l'achat ni à la vente, 0 $ de commission",
  notes: ["exécution et garde chez DriveWealth, LLC (CRD 165429) : Q de DriveWealth", "frais mensuels du seul compte Managed Investing, hors trajet"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
