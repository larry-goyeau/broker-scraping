// What one round trip costs at VR Bank Starnberg-Zugspitze eG (a Volksbank
// on the DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the
// Frankfurt floor or Tradegate and sell them straight back, online
// ("Online-Brokerage"), in dollars. Two online order prices, so two plans:
//   "standard"   the Depot
//   "meindepot"  meinDepot für junge Kunden (bis 30 Jahre)
//
// Read 2026-10-26, Preis- und Leistungsverzeichnis Stand 01.07.2026:
//   https://atruvia.scene7.com/is/content/atruvia/PLVpdf-42
//   9.1.1 "Kauf und Verkauf (Provision)", Depot, "Ausführung im Inland",
//   column "Online-Brokerage Provision: % vom Kurswert/Minimum": Aktien,
//   Optionsscheine and "Investmentanteile über Börse" "bis 4.999,99 EUR:
//   0,50 bis 9.999,99 EUR: 0,40 ab 10.000,00 EUR: 0,30 - mind. 15,00 EUR"
//   (the other column, 1,0 / 25,00 EUR, is the branch). "Zusätzlich wird die
//   Bank die ihr bei der Auftragsausführung und -abwicklung von Dritten
//   berechneten Auslagen und fremden Kosten in Rechnung stellen."
//   "Limitvormerkung, -änderung und -streichung ... Online Brokerage: 2,50
//   EUR pro Auftrag", footnote 43 "Wird nur dann berechnet, wenn der Auftrag
//   nicht ausgeführt wird" (not on an executed trip).
//   "meinDepot für junge Kunden (bis 30 Jahre)", Inland, Online-Brokerage:
//   "Alle als Best Execution ausgeführt 3,95 EUR", "Alle 4,95 EUR",
//   "Kleinstorder unter 10 EUR gebührenfrei".
//   9.2.1 custody: Depot 0,20 % of the value a year, "Mindestpreis pro Depot
//   17,85 EUR", "Mindestpreis pro Bestandsposten 5,95 EUR"; meinDepot
//   "gebührenfrei".
//
// A side: standard value × 0.50 % up to 4,999.99 €, 0.40 % up to 9,999.99 €,
// 0.30 % from 10,000 €, at least 15 € (ETCs and ETNs, not named in the
// table, take the same rate as shares, warrants and fund units, the only
// equity-type rows; every one of them prints the same price); meinDepot
// 4.95 €, free under 10 €. A catalogue row is an order on its own venue, so
// the 3.95 € Best Execution price is a remark ("Fees might be x% lower.").
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": Xetra and Frankfurt Basic models, 0.10 € delivery fee a side
// on Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate set "durch
// ein Verfahren ..., bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist", no margin printed: N/A. Taxes (French, Italian,
// Spanish FTT on the buy) from taxMap.mjs. Left out: branch orders, foreign
// exchanges (min 50 €), partial fills on different days.
//
//   node brokers/vrstarnbergzugsp/vrstarnbergzugsp_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrstarnbergzugsp/vrstarnbergzugsp_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, bandFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;
const SMALL = 10;
const ONLINE = [
  { upTo: 4_999.99, rate: 0.005, min: 15 },
  { upTo: 9_999.99, rate: 0.004, min: 15 },
  { upTo: Infinity, rate: 0.003, min: 15 },
];

// The Best Execution price's cut of the 4,95 € order price itself: 20 %.
function bestExecutionRemark({ notionalEur }) {
  if (notionalEur < SMALL) return "";
  return `Fees might be ${Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT)}% lower.`;
}

const SCHEDULE = {
  broker: "VR Bank Starnberg-Zugspitze",
  folder: "vrstarnbergzugsp",
  catalogueUrl: new URL("vrstarnbergzugsp-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/PLVpdf-42",
  readOn: "2026-10-26",
  entity: "VR Bank Starnberg-Zugspitze eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "standard",
  plans: {
    standard: {
      label: "Depot",
      commission: ({ notionalEur }) => bandFee(notionalEur, ONLINE, "Online-Brokerage, Inland"),
      remark: "Custody 0.20% a year, min 5.95 € a line.",
      basis:
        "PLV VR Bank Starnberg-Zugspitze Stand 01.07.2026, 9.1.1, Online-Brokerage Inland, relu le 2026-10-26 : 0,50 % jusqu'à 4 999,99 €, 0,40 % jusqu'à 9 999,99 €, 0,30 % au-delà, min 15 €",
    },
    meindepot: {
      label: "meinDepot (up to 30)",
      commission: ({ notionalEur }) =>
        notionalEur < SMALL
          ? { eur: 0, note: "meinDepot, Kleinstorder unter 10 EUR : gratuit" }
          : { eur: MEINDEPOT, note: "meinDepot, Online-Brokerage Inland, alle : 4,95 €" },
      remark: bestExecutionRemark,
      basis:
        "PLV VR Bank Starnberg-Zugspitze Stand 01.07.2026, 9.1.1, meinDepot (jusqu'à 30 ans), relu le 2026-10-26 : 4,95 € l'ordre, 3,95 € en Best Execution, gratuit sous 10 €",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
