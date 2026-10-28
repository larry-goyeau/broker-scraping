// What one round trip costs at Volksbank in Ostwestfalen (a Volksbank on the
// DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars. Two
// online order prices, so two plans:
//   "trader"    Trader-Depot (opened online only); the Young-Invest-Depot
//               (clients up to 30) has the same online price
//   "allinone"  All-in-One-Depot (the advisory depot)
//
// Read 2026-10-26:
//   https://www.volksbankinostwestfalen.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depotmodelle.html
//   "Ordererteilung über Online-Brokerage", "Ausführung eines
//   Kommissionsauftrags im Inland zum Kauf oder Verkauf von: Aktien,
//   Optionsscheinen, Investmentanteilen, sonstigen Wertpapieren":
//     Trader-Depot and Young-Invest-Depot: "0,25 % vom Ordervolumen,
//     Mindestpreis pro Ordererteilung (Abrechnung): 9,90 EUR, Maximalpreis
//     pro Ordererteilung (Abrechnung): 79,90 EUR"
//     All-in-One-Depot: "ab 0,00 EUR 0,50 %, ab 10.000 EUR 0,40 %, ab 25.000
//     EUR 0,30 %, ab 50.000 EUR 0,20 %, vom Kurswert, zzgl. Grundgebühr:
//     10,00 EUR"
//   "Zuschlag für Orders an ausländischen Börsen 39,90 EUR" (not this trip).
//   Custody: All-in-One "1,75 ‰ p. a. vom Kurswert, min. 30,00 EUR pro Jahr";
//   Trader-Depot "kostenfrei bei min. einem kostenpflichtigen Börsen-Trade
//   pro Quartal, ansonsten ... analog dem All-in-one-Depot"; Young-Invest
//   free up to 30. "Berechnete Auslagen und fremde Kosten, die uns als Bank
//   bei der Auftragsausführung und -abwicklung von Dritten entstehen,
//   stellen wir zusätzlich in Rechnung."
//   Preisaushang Stand 01.10.2026, p. 2, Aktien "bei Online-Ordererteilung je
//   nach Volumen 0,20 – 0,50 %", "zzgl. Grundgebühr 10,00 EUR"; "Limit-
//   vormerkung, -änderung und -streichung 0,00 EUR":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-93
//
// The All-in-One band is read on the whole order value, which then pays
// that one rate. A side: trader max(9.90, min(79.90, 0.25 % × value));
// allinone 10 € + band rate × value. The venue's charges come on top, priced
// in ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side
// on Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: bank
// and phone orders (1 % + 10 €; Trader-Depot phone surcharge 19.90 €),
// partial fills on different days.
//
//   node brokers/volksbankinostwe/volksbankinostwe_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//   node brokers/volksbankinostwe/volksbankinostwe_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4 --plan=allinone
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, bandFee, printCli } from "../1822direkt/germanyCost.mjs";

const ALL_IN_ONE = [
  { upTo: 9_999.99, base: 10, rate: 0.005 },
  { upTo: 24_999.99, base: 10, rate: 0.004 },
  { upTo: 49_999.99, base: 10, rate: 0.003 },
  { upTo: Infinity, base: 10, rate: 0.002 },
];

export const PLANS = {
  trader: {
    label: "Trader-Depot",
    commission: ({ notionalEur }) =>
      pctFee(notionalEur, { rate: 0.0025, min: 9.9, max: 79.9, label: "Online-Brokerage Trader-Depot" }),
    remark: "Custody 0.175% a year (at least 30 €) unless one paid trade a quarter.",
    basis:
      "barème Volksbank in Ostwestfalen relu le 2026-10-26 (page Depotmodelle) : Trader-Depot, Online-Brokerage " +
      "0,25 % de l'Ordervolumen, min 9,90 €, max 79,90 €",
  },
  allinone: {
    label: "All-in-One-Depot",
    commission: ({ notionalEur }) => bandFee(notionalEur, ALL_IN_ONE, "Online-Brokerage All-in-One-Depot"),
    remark: "Custody 0.175% a year, at least 30 €.",
    basis:
      "barème Volksbank in Ostwestfalen relu le 2026-10-26 (page Depotmodelle et Preisaushang du 01.10.2026) : " +
      "All-in-One-Depot, Online-Brokerage 0,50 % / 0,40 % dès 10 000 € / 0,30 % dès 25 000 € / 0,20 % dès 50 000 € + 10 €",
  },
};

const SCHEDULE = {
  broker: "Volksbank in Ostwestfalen",
  folder: "volksbankinostwe",
  catalogueUrl: new URL("volksbankinostwe-parsed.json", import.meta.url),
  url: "https://www.volksbankinostwestfalen.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depotmodelle.html",
  readOn: "2026-10-26",
  entity: "Volksbank in Ostwestfalen eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  plans: PLANS,
  defaultPlan: "trader",
};

export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
