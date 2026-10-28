// What one round trip costs at Volksbank Kurpfalz eG (a Volksbank on the DZ
// BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars. Two
// online order prices, so two plans:
//   "standard"  Standard-Depotmodell, Online-Brokerage
//   "meindepot" meinDepot für junge Kunden (bis 30 Jahre)
//
// Read 2026-10-26:
//   https://www.volksbank-kurpfalz.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Gültige Preise für Neueröffnungen ab 1.9.2025 / für Bestandsdepots ab
//   1.1.2026": "Depot-/Verwahrentgelt pro Jahr inkl. USt. 0,18 %"; "Order
//   Entgeltmodell Inland", "Kauf/Verkauf von börslichen Wertpapieren online
//   5,00 EUR zzgl. 0,50 % vom Kurswert" (Filiale 15 € + 1 %, Telefon 30 € +
//   1 %: not this trip).
//   Preisaushang Stand 01.10.2026, "Wertpapiere", Standard-Depotmodell,
//   Ausführung im Inland, Online-Brokerage, for Aktien, Investmentanteile über
//   Börse, Zertifikate über Börse, sonstige Wertpapiere: "Grundpreis: 5,00 EUR
//   zzgl. 0,50 % Provision vom Kurswert/Nennwert"; meinDepot, Ausführung im
//   Inland, Online-Brokerage: "alle 4,95 EUR", "Alle (als Best Execution
//   ausgeführt) 3,95 EUR"; "Limitvormerkung, -änderung und -streichung
//   kostenfrei"; custody Standard "0,045% vom Kurswert pro Quartal",
//   meinDepot "kostenfrei":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-156
//
// A side: standard 5.00 € + 0.50 % × value (no minimum or cap printed);
// meinDepot 4.95 €. A catalogue row is an order on its own venue ("gemäß
// Weisung"), so meinDepot pays 4.95 € and the 1 € Best Execution saving
// (DZ BANK then picks the venue) is the remark "Fees might be x% lower.".
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy
// and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// branch and phone orders, foreign exchanges (35 € + 0.50 %; meinDepot
// 34.95 €), partial fills on different days.
//
//   node brokers/volksbankkurpfal/volksbankkurpfal_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankkurpfal/volksbankkurpfal_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEIN_DEPOT = 4.95;
const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side

function bestExecutionRemark() {
  const pct = Math.round((100 * BEST_EXECUTION_SAVING) / MEIN_DEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "Volksbank Kurpfalz",
  folder: "volksbankkurpfal",
  catalogueUrl: new URL("volksbankkurpfal-parsed.json", import.meta.url),
  url: "https://www.volksbank-kurpfalz.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Kurpfalz eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "standard",
  plans: {
    standard: {
      label: "Standard",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { base: 5, rate: 0.005, label: "Online-Brokerage, Inland" }),
      remark: "Custody 0.18% a year.",
      basis:
        "barème Volksbank Kurpfalz relu le 2026-10-26 (page Wertpapierdepot et Preisaushang du 01.10.2026) : " +
        "Standard-Depotmodell, Online-Brokerage en Allemagne 5,00 € + 0,50 % du Kurswert",
    },
    meindepot: {
      label: "meinDepot (up to 30)",
      commission: () => ({ eur: MEIN_DEPOT, note: "meinDepot, Online-Brokerage Inland : 4,95 € l'ordre" }),
      remark: bestExecutionRemark,
      basis:
        "Preisaushang Volksbank Kurpfalz du 01.10.2026, meinDepot (jusqu'à 30 ans) : " +
        "4,95 € l'ordre sur une place allemande désignée, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
