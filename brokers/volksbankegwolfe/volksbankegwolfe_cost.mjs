// What one round trip costs at Volksbank eG Wolfenbüttel ("Volksbank mit
// Herz"; DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the
// Frankfurt floor or Tradegate and sell them straight back, online, in
// dollars. Two depot models with different online prices, so two plans.
//
// Read 2026-10-26, Preis- und Leistungsverzeichnis "Stand: 01.10.2026"
// (linked from every page footer; the Preisaushang covers accounts only):
//   https://atruvia.scene7.com/is/content/atruvia/1105-plvpdf-1
//   9.1.1 "Kauf und Verkauf (Provision)", PrivatDepot, Ausführung im Inland,
//   Online-Brokerage: "Aktien, Optionsscheine" "0,30 %" "mind. 15,00 EUR";
//   "Investmentanteile über Börse" "0,30 %" "mind. 15,00 EUR" (branch orders
//   1,00 % / 0,50 %, min 30 €: not this trip).
//   meinDepot ("für junge Leute bis zur Vollendung des 31. Lebensjahres"):
//   "Ausführung an allen inländischen Börsenplätzen" 4,95 EUR, "(als Best
//   Execution)" 3,95 EUR; footnote "Bis 10 Euro Kurswert: 1,95 Euro".
//   "Zusätzlich wird die Bank die ihr bei der Auftragsausführung und
//   -abwicklung von Dritten berechneten Auslagen und fremden Kosten in
//   Rechnung stellen."
//   9.2.1 custody, PrivatDepot: shares in Girosammelverwahrung "0,15 %" a
//   year, "Grundpreis pro Depot (inkl. USt) 20,00 EUR"; Investmentanteile
//   0,00 %; meinDepot "Grundpreis pro Depot 0,00 EUR".
//
// Plans (one row each, `query.plan`), a side:
//   privatdepot  max(15, 0.30 % × value)
//   meindepot    4.95 € (1.95 € up to 10 € of value)
// A catalogue row is an order on its own venue ("gemäß Weisung"), so
// meinDepot pays 4.95 €; the 3.95 € Best Execution price (DZ BANK then
// picks the venue) is the remark "Fees might be x% lower ...", x = the
// cut of the 4.95 € order price (1.00 € / 4.95 €). The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side on
// Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line: "wird der Wechselkurs durch ein
// Verfahren ermittelt, bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist", no margin printed: forced, unpublished FX, N/A.
// Taxes (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left
// out: branch orders, foreign exchanges (0.30 % min 50 €; meinDepot
// 34.95 €), limit fees (0 € online), partial fills on different days.
//
//   node brokers/volksbankegwolfe/volksbankegwolfe_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankegwolfe/volksbankegwolfe_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const BEST_EXECUTION = 3.95;
const MEINDEPOT = 4.95;
const SMALL = 1.95;
const PLV = "PLV de la Volksbank eG Wolfenbüttel (Stand 01.10.2026) relu le 2026-10-26";

function bestExecutionRemark({ notionalEur }) {
  if (!(notionalEur > 10)) return "";
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower if sent as a Best Execution order.`;
}

export const PLANS = {
  privatdepot: {
    label: "PrivatDepot (Online-Brokerage)",
    commission: ({ notionalEur }) =>
      pctFee(notionalEur, { rate: 0.003, min: 15, label: "PrivatDepot, Online-Brokerage Inland" }),
    // Investmentanteile (ETFs) are kept at 0.00 %, other lines at 0.15 %.
    remark: ({ listing }) => (listing?.type === "ETF" ? "Custody 20 € a year." : "Custody 0.15% a year plus 20 €."),
    basis: `${PLV} : PrivatDepot, Online-Brokerage Inland, 0,30 % du Kurswert, min 15 €`,
  },
  meindepot: {
    label: "meinDepot (under 31)",
    commission: ({ notionalEur }) =>
      notionalEur <= 10
        ? { eur: SMALL, note: "meinDepot, jusqu'à 10 € de Kurswert : 1,95 € l'ordre" }
        : { eur: MEINDEPOT, note: "meinDepot, alle inländischen Börsenplätze : 4,95 € l'ordre" },
    remark: bestExecutionRemark,
    basis: `${PLV} : meinDepot (moins de 31 ans) 4,95 € l'ordre sur une place allemande désignée, 3,95 € en Best Execution`,
  },
};

const SCHEDULE = {
  broker: "Volksbank eG Wolfenbüttel",
  folder: "volksbankegwolfe",
  catalogueUrl: new URL("volksbankegwolfe-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/1105-plvpdf-1",
  readOn: "2026-10-26",
  entity: "Volksbank eG Wolfenbüttel (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  plans: PLANS,
  defaultPlan: "privatdepot",
};

export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
