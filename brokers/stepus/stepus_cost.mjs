// What one round trip costs at Step (Step Advisers LLC; orders executed and
// accounts held at DriveWealth, LLC): buy n shares at price p, sell them
// straight back, in the app, in dollars. US-listed stocks and ETFs, whole or
// fractional. Crypto stays out.
//
// Help article "How do I buy and sell stocks?", read 2026-10-26:
//   https://help.step.com/en/articles/6967968-how-do-i-buy-and-sell-stocks
//   https://step.com/investing   ("without commission fees")
//
//   commission   "Step does not charge any commission fees."
//   on the sale  "a government fee included to cover our costs ... the FINRA
//                transaction activity fee (TAF), and the Security and
//                Exchange Commission fees":
//                "TAF = $0.000119 per share with a maximum of $5.95 per trade
//                (rounded up to the nearest cent)"
//                "SEC = total transaction amount * $22.90 / 1,000,000
//                (rounded up to the nearest cent)"
//   CAT          not printed: 0
//   "These fees are automatically deducted from the profits of any stock
//   sale and only occur on the sale of stocks."
//   Form ADV 2A: Step Advisers charges no advisory fee.
//
// The printed rates are the regulators' rates of 2022; the article calls
// them the fees "charged by regulators to all brokerages", passed on. So the
// trip charges the regulators' current rates with Step's rounding (each
// rounded up to the cent, on the sale): SEC 0.0000206 of the sale since
// 2026-04-04, and the FINRA TAF, which is paused from 2026-10-01 to
// 2026-12-31 (SR-FINRA-2026-021) and so $0 today; after that $0.000195 a
// share, cap $9.79 (usCost.mjs).
//
// Formula: book (605 × Q of DriveWealth) + $0 + $0 + SEC (up) + TAF (up).
//
// Routing: the accounts and order processing are at DriveWealth, LLC
// (CRD 165429; Form ADV 2A: "order processing is conducted through
// DriveWealth, LLC"), which files its own 606: rule606 key "drivewealth".
//
// Cash is dollars (Step Spend account) and every line is in dollars: no
// conversion.
//
//   node brokers/stepus/stepus_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/stepus/stepus_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Step",
  folder: "stepus",
  catalogueUrl: new URL("stepus-parsed.json", import.meta.url),
  url: "https://help.step.com/en/articles/6967968-how-do-i-buy-and-sell-stocks",
  adv: "https://step.com/policies/pdf/form-adv-2a",
  readOn: "2026-10-26",
  entity: "Step Advisers LLC (advisory), DriveWealth, LLC (execution, custody)",
  rule606: "drivewealth",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis:
    "aide Step « How do I buy and sell stocks? », relue le 2026-10-26 : « Step does not charge any commission fees », " +
    "TAF et SEC répercutées à la vente, chacune arrondie au centime supérieur",
  notes: [
    "taux imprimés de 2022 (TAF 0,000119 $, SEC 22,90 $ par million) : l'article les dit fixés par les régulateurs, le trajet prend les taux en vigueur",
    "exécution et garde chez DriveWealth, LLC (CRD 165429) : Q de DriveWealth",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
