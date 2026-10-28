// What one round trip costs at Volksbank im Westen eG (a Volksbank on the DZ
// BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars. Three
// depot models with different online order prices, so three plans:
//   "direkt"    DirektDepot (opened online)
//   "meindepot" meinDepot, "nur für Kunden bis einschließlich 30 Jahren"
//   "beratung"  Beratungsdepot (the advisory depot), Online-Brokerage price
//
// Read 2026-10-26:
//   https://www.volksbank-im-westen.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "DirektDepot": "Grundpreis je Order 12,50 €", "zzgl. Bei Order (vom
//   Kurswert) 0,20 %", "Depotentgelt ab 0,00 €", footnote "kostenfreie
//   Depotführung bei drei börslichen Orders pro Quartal, ansonsten 35,70 EUR
//   pro Jahr". "meinDepot": "Grundpreis je Order 4,95 €", "Grundpreis je
//   Order bei Ausführung als Best Execution 3,95 €", "Depotentgelt 0,00 €".
//   Preisaushang (file "Preisaushang per 01.10.2026"), "Wertpapiere",
//   "Ausführung Kommissionsauftrag zum Kauf/Verkauf (inl. Börse) über ein
//   Beratungsdepot", column "Online-Brokerage", Ordergröße (Aktien/Renten):
//   bis 10,00 EUR 0,00 EUR; 10,01 bis 50,00 EUR 7,00 EUR; 50,01 bis 500,00
//   EUR 15,00 EUR; 500,01 bis 5.000,00 EUR 15,00 EUR; 5.000,01 bis 7.500,00
//   EUR 25,00 EUR; 7.500,01 bis 10.000,00 EUR 35,00 EUR; 10.000,01 bis
//   20.000,00 EUR 50,00 EUR; über 20.000,00 EUR 0,30 % vom Kurswert (the
//   "Standard" column, twice as dear, is the non-online order).
//   Girosammelverwahrung Beratungsdepot "2,08 ‰ vom Kurs- bzw.
//   Nominalwert" a year, "Mindestentgelt pro Bestandsposten 8,93 EUR",
//   "Mindestpreis pro Depot 17,85 EUR":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushang%20per%2001.10.2026%202pdf
//
// A side: direkt 12.50 € + 0.20 % × value; meinDepot 4.95 €; beratung the
// band price above, read on the whole order value (Aktien/Renten; ETFs,
// ETCs and ETNs bought on an exchange take the same line). A catalogue row
// is an order on its own venue ("gemäß Weisung"), so meinDepot pays 4.95 €
// and the 1 € Best Execution saving (DZ BANK then picks the venue) is the
// remark "Fees might be x% lower.". The venue's charges come on top, priced
// in ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side
// on Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// branch orders, foreign exchanges, partial fills on different days.
//
//   node brokers/volksbankimweste/volksbankimweste_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankimweste/volksbankimweste_cost.mjs DE0007164600 XFRA EUR --shares=4 --price=215 --plan=beratung
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, bandFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEIN_DEPOT = 4.95;
const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side

// Beratungsdepot, Online-Brokerage, Inland: order value bands (upper bound
// inclusive, euro).
const ADVISORY_BANDS = [
  { upTo: 10, base: 0 },
  { upTo: 50, base: 7 },
  { upTo: 5_000, base: 15 },
  { upTo: 7_500, base: 25 },
  { upTo: 10_000, base: 35 },
  { upTo: 20_000, base: 50 },
  { upTo: Infinity, rate: 0.003 },
];

function bestExecutionRemark() {
  const pct = Math.round((100 * BEST_EXECUTION_SAVING) / MEIN_DEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "Volksbank im Westen",
  folder: "volksbankimweste",
  catalogueUrl: new URL("volksbankimweste-parsed.json", import.meta.url),
  url: "https://www.volksbank-im-westen.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank im Westen eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "direkt",
  plans: {
    direkt: {
      label: "DirektDepot",
      commission: ({ notionalEur }) => pctFee(notionalEur, { base: 12.5, rate: 0.002, label: "DirektDepot" }),
      remark: "Custody 35.70 € a year unless 3 trades a quarter.",
      basis:
        "barème Volksbank im Westen relu le 2026-10-26 (page Wertpapierdepot) : DirektDepot 12,50 € + 0,20 % du Kurswert l'ordre",
    },
    meindepot: {
      label: "meinDepot (up to 30)",
      commission: () => ({ eur: MEIN_DEPOT, note: "meinDepot, Grundpreis je Order : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "barème Volksbank im Westen relu le 2026-10-26 (page Wertpapierdepot) : meinDepot (jusqu'à 30 ans) " +
        "4,95 € l'ordre sur une place désignée, 3,95 € en Best Execution",
    },
    beratung: {
      label: "Beratungsdepot",
      commission: ({ notionalEur }) => bandFee(notionalEur, ADVISORY_BANDS, "Beratungsdepot, Online-Brokerage Inland"),
      remark: "Custody 0.208% a year, at least 8.93 € a holding.",
      basis:
        "Preisaushang Volksbank im Westen (per 01.10.2026) relu le 2026-10-26 : Beratungsdepot, Online-Brokerage en " +
        "Allemagne, prix par tranche de valeur (15 € de 50,01 à 5 000 €, 0,30 % au-delà de 20 000 €)",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
