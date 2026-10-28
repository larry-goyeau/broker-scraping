// What one round trip costs at Volksbank Trier Eifel eG (DZ BANK / Atruvia
// online brokerage, OnlineBanking and VR Banking App): buy n shares on
// Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars. Two order prices, so two plans:
//   "online"    Depot Online, 7,50 € + 0,25 %, max 50 € a side
//   "meindepot" MeinDepot, for clients up to their 31st birthday, 4,95 € a
//               side on a German exchange (3,95 € as Best Execution)
//
// Read 2026-10-26:
//   https://www.volksbank-trier-eifel.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Depotmodelle, Konditionen und Gebühren" ("Auszug aus unserem Preis- und
//   Leistungsverzeichnis (Stand: 01.07.2026)"), columns MeinDepot / Depot
//   Online "durch Mitarbeiter der Bank" / "online": "Transaktionsentgelte**
//   (inländische Börse) Grundpreis ab 3,95 €*** 7,50 € 7,50 €", "variable
//   Gebühr (in % v. Kurswert) 0,00 % 1,50 % 0,25 %", "Maximalentgelt pro
//   Order 4,95 €*** 50,00 €"; "*** Bei Ausführung über inländische
//   Börsenplätze 4,95 €, als Best Execution 3,95 €"; "**gegebenenfalls
//   zuzüglich von Dritten berechneter Auslagen und fremder Kosten";
//   custody, Depot Online: "Grundpreis p.m. 3,00 €*", "Grundpreis variable
//   Gebühr (in % vom Depotwert Stand 31.12.) 0,10%*", "* Bei Tätigung mind.
//   4 provisionspflichtigen Transaktionen pro Jahr (exkl.
//   Sparplanausführung) werden nur 50 % der Verwahrentgelte berechnet";
//   MeinDepot 0,00 €. "meinDepot Premium" is a flat fee on the depot (1,20 %
//   p.a.) with advice: custody, not a trade price, not a row.
//
// A side: Depot Online min(50, 7.50 + 0.25 % × value); MeinDepot 4.95 €. A
// catalogue row is an order on its own venue (gemäß Weisung), so MeinDepot
// takes the 4.95 € price and the 3.95 € Best Execution price is a remark
// "Fees might be x% lower.", x = the cut of the 4.95 € order price
// (1 € / 4.95 €, the same on both legs). The same for shares, ETFs,
// ETCs and ETNs. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt Transaktions- and
// Handelsentgelt; group "dz": 0.10 € delivery fee a side on Tradegate). Same
// on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate (DZ BANK GenoFX), with no margin printed for securities: forced,
// unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: orders through the bank's staff, foreign exchanges,
// DZ BANK derivatives, partial fills on different days.
//
//   node brokers/volksbanktrierei/volksbanktrierei_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbanktrierei/volksbanktrierei_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const ONLINE = { base: 7.5, rate: 0.0025, max: 50 };
const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;

function meinDepotRemark() {
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "Volksbank Trier Eifel",
  folder: "volksbanktrierei",
  catalogueUrl: new URL("volksbanktrierei-parsed.json", import.meta.url),
  url: "https://www.volksbank-trier-eifel.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Trier Eifel eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "online",
  plans: {
    online: {
      label: "Depot Online",
      commission: ({ notionalEur }) => pctFee(notionalEur, { ...ONLINE, label: "Depot Online, Transaktionsentgelt online" }),
      remark: "Custody 36 € a year plus 0.10% (half with 4 or more trades a year).",
      basis:
        "page Wertpapierdepot de la Volksbank Trier Eifel (extrait du PLV Stand 01.07.2026) relue le 2026-10-26 : Depot Online, " +
        "ordre en ligne sur une Bourse allemande 7,50 € + 0,25 % du Kurswert, max 50 €, plus les frais de la place",
    },
    meindepot: {
      label: "MeinDepot (under 31)",
      commission: () => ({ eur: MEINDEPOT, note: "MeinDepot, ordre sur une place allemande : 4,95 €" }),
      remark: meinDepotRemark,
      basis:
        "page Wertpapierdepot de la Volksbank Trier Eifel (extrait du PLV Stand 01.07.2026) relue le 2026-10-26 : MeinDepot " +
        "(jusqu'à 31 ans), 4,95 € l'ordre sur une place allemande, 3,95 € en Best Execution, plus les frais de la place",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
