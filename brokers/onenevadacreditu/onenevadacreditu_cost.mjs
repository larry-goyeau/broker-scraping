// What one round trip costs in One Nevada Credit Union's OneNVest,
// self-directed account at Atomic Brokerage: buy n shares at price p, sell
// them back at once, in regular hours, in dollars. US-listed stocks and
// ETFs, fractional (dollar) orders only. Automated portfolios (Atomic
// Invest) are managed products and stay out.
//
// Read 2026-10-26:
//   https://www.onenevada.org/onenvest
//   https://legal.atomicvest.com/usa.broker.schedule.7ea28665-88a9-4542-a748-987e90ea46b6.pdf
//
//   commission      $0 each way: "there are $0 commissions charged on
//                   trades of U.S. listed registered securities" placed
//                   "during the U.S. markets' regular trading hours".
//   other fees      "Other fees such as regulatory fees, exchange fees, wire
//                   transfer fees and account maintenance fees may apply.
//                   See Atomic Brokerage's fee schedule". That schedule
//                   ("Schedule of Maximum Charges", as of 6/5/2024) is a
//                   ceiling ("Your investment advisor may have negotiated
//                   lower rates"): US Stocks $5.00 per order, individual
//                   account maintenance $3.00 a month. The member page's
//                   $0 commission is the negotiated rate, so the trip uses
//                   $0; the maintenance ceiling is not an order cost. It
//                   prints no SEC, TAF or CAT figure.
//   SEC / TAF       "Other fees such as regulatory fees ... may apply": SEC
//                   and TAF at the regulators' rates, rounded up to the
//                   cent (no rate or rounding printed). CAT not named, 0.
//
// Formula: book + 0 + SEC and TAF on the sale. Atomic Brokerage LLC, clearing and custody at
// Pershing LLC. Atomic files its own 606 (2026 Q2, PDF only):
//   https://cdn.finra.org/606/2026/315263_606_NMS_2026_Q2_V1.pdf
// key `atomic` in spreads/rule606.mjs, the book is the blended 605 × that
// 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/onenevadacreditu/onenevadacreditu_cost.mjs US0378331005 XNAS USD --shares=3.8 --price=262
//   node brokers/onenevadacreditu/onenevadacreditu_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "One Nevada Credit Union (OneNVest)",
  folder: "onenevadacreditu",
  catalogueUrl: new URL("onenevadacreditu-parsed.json", import.meta.url),
  url: "https://www.onenevada.org/onenvest",
  readOn: "2026-10-26",
  entity: "Atomic Brokerage LLC (broker-dealer), Pershing LLC (clearing, custody)",
  rule606: "atomic",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis:
    "page OneNVest, relue le 2026-10-26 : « $0 commissions charged on trades of U.S. listed registered securities » en heures normales, 0 $ à l'achat et à la vente",
  notes: [
    "barème plafond d'Atomic Brokerage (6/5/2024) : 5 $ par ordre au maximum, remplacé par le 0 $ négocié de la page ; frais de tenue jusqu'à 3 $/mois hors trajet ; « regulatory fees ... may apply » sans chiffre : SEC et TAF aux taux des régulateurs, arrondi au centime supérieur",
    "606 de Atomic Brokerage (CRD 315263), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
