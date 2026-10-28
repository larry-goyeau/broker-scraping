// What one round trip costs at Volksbank Niedersachsen-Mitte eG (a Volksbank
// on the DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the
// Frankfurt floor or Tradegate and sell them straight back, online
// ("Online-Brokerage"), in dollars. Two online order prices, so two plans:
//   "normal"     Normaldepot
//   "meindepot"  meinDepot für junge Kunden (bis 30 Jahre)
//
// Read 2026-10-26, Preis- und Leistungsverzeichnis Stand 03.08.2026 (the
// depot page: "Konditionen ... entnehmen Sie bitte unserem Preis- und
// Leistungsverzeichnis, Punkt 9"):
//   https://atruvia.scene7.com/is/content/atruvia/Preis_und_Leistungsverzeichnis03082026pdf
//   9.1.1 "Kauf und Verkauf (Provision)", Normaldepot, "Ausführung im
//   Inland", column "Online-Brokerage Provision: % vom Kurswert/Minimum":
//   "Aktien, Bezugsrechte, Optionsscheine und sonstige aktienähnliche Werte,
//   Investmentanteile über Börse" "0,40% mind. 9,95 EUR" (the other column,
//   1,00 % mind. 39,95 EUR, is the branch).
//   "Sonderkonditionen meinDepot für junge Kunden (bis 30 Jahre)", Inland,
//   Online-Brokerage: "alle 4,95 EUR", "alle (als Best Execution
//   ausgeführt) 3,95 EUR"; "ab Alter von 31 Jahren erfolgt Umstellung auf
//   Konditionen „Standarddepot/Normaldepot“".
//   "Zusätzlich wird die Bank die ihr bei der Auftragsausführung und
//   -abwicklung von Dritten berechneten Auslagen und fremden Kosten in
//   Rechnung stellen." "Limitvormerkung, -änderung und -streichung ...
//   Online-Brokerage 0,00 EUR pro Auftrag".
//   9.2.1 custody: Normaldepot "0,04% pro Quartal auf das Gesamtdepot",
//   "Mindestpreis pro Depot 5,00 EUR pro Quartal", footnote 72 "Ab drei
//   börslichen Orders pro Quartal kein Depotentgelt für das Quartal";
//   meinDepot "0,00 EUR".
//
// A side: normal 0.40 % × value, at least 9.95 €, no cap (ETCs and ETNs
// take the share rate, the only equity-type row); meinDepot 4.95 €. A
// catalogue row is an order on its own venue, so the 3.95 € Best Execution
// price is a remark ("Fees might be x% lower."). The venue's charges come on
// top, priced in ../1822direkt/germanyCost.mjs (group "dz": Xetra and
// Frankfurt Basic models, 0.10 € delivery fee a side on Tradegate). Same on
// the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate set "durch
// ein Verfahren ..., bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist", no margin printed: N/A. Taxes (French, Italian,
// Spanish FTT on the buy) from taxMap.mjs. Left out: branch orders, foreign
// exchanges (min 39.95 €), savings plans, partial fills on different days.
//
//   node brokers/volksbanknieders/volksbanknieders_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbanknieders/volksbanknieders_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;

// The Best Execution price as a cut of the meinDepot order price itself.
function bestExecutionRemark() {
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "Volksbank Niedersachsen-Mitte",
  folder: "volksbanknieders",
  catalogueUrl: new URL("volksbanknieders-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/Preis_und_Leistungsverzeichnis03082026pdf",
  readOn: "2026-10-26",
  entity: "Volksbank Niedersachsen-Mitte eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "normal",
  plans: {
    normal: {
      label: "Normaldepot",
      commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.004, min: 9.95, label: "Online-Brokerage, Inland" }),
      remark: "Custody 0.16% a year, min 20 €, free with 3 trades a quarter.",
      basis:
        "PLV Volksbank Niedersachsen-Mitte Stand 03.08.2026, 9.1.1, Normaldepot, Online-Brokerage Inland, relu le 2026-10-26 : 0,40 % du Kurswert, min 9,95 €",
    },
    meindepot: {
      label: "meinDepot (up to 30)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Online-Brokerage Inland, alle : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "PLV Volksbank Niedersachsen-Mitte Stand 03.08.2026, 9.1.1, meinDepot (jusqu'à 30 ans), relu le 2026-10-26 : 4,95 € l'ordre, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
