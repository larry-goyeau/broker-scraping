// What one round trip costs at Münchner Bank eG (a cooperative bank on the
// DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online
// ("Online-Brokerage"), in dollars. Two online order prices, so two plans:
//   "standard"   the depot
//   "meindepot"  meinDepot, clients under 26
//
// Read 2026-10-26:
//   Preisaushang "Regelsätze im standardisierten Privatkundengeschäft",
//   Stand 02.10.2026, "Wertpapiere", "Ausführungen im Inland", "Aktien",
//   "Online-Brokerage Provision": "0,50% vom Kurswert, mind. 25,00 €" (the
//   other column, "1% vom Kurswert, mind. 50,00 €", is the branch);
//   "Limitvormerkung, -änderung und -streichung pro Auftrag 5,00 €", footnote
//   "Wird nur berechnet, wenn der Auftrag nicht ausgeführt wird";
//   "Girosammelverwahrung (inkl. USt.): 0,2% vom Kurswert/Nennwert p.a.",
//   "Mindestpreis pro Depot (inkl. USt.) p.a. 11,90 €":
//   https://atruvia.scene7.com/is/content/atruvia/preisaushangpdf-29
//   meinDepot page: "können alle unter 26 Jahren ... nutzen", "Kostenfreie
//   Depotführung", "Pauschale Ordergebühren für Einzel-Orders an allen
//   inländischen Börsenplätzen von nur 1 Euro":
//   https://www.muenchner-bank.de/jugendmarkt/meindepot.html
//
// A side: standard 0.50 % × value, at least 25 €, no cap. The notice prints
// only an "Aktien" row for exchange orders (fund units are listed only
// "außerbörslich"), so ETFs, ETCs and ETNs take the share rate. meinDepot
// 1 € flat. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz": Xetra and Frankfurt Basic
// models, 0.10 € delivery fee a side on Tradegate). Same on the buy and the
// sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// branch orders, foreign exchanges, partial fills on different days.
//
//   node brokers/munchner/munchner_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/munchner/munchner_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 1;

const SCHEDULE = {
  broker: "Münchner Bank",
  folder: "munchner",
  catalogueUrl: new URL("munchner-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/preisaushangpdf-29",
  readOn: "2026-10-26",
  entity: "Münchner Bank eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "standard",
  plans: {
    standard: {
      label: "Depot",
      commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.005, min: 25, label: "Online-Brokerage, Inland" }),
      remark: "Custody 0.20% a year, min 11.90 €.",
      basis:
        "Preisaushang Münchner Bank Stand 02.10.2026, Wertpapiere, Online-Brokerage Inland, relu le 2026-10-26 : 0,50 % du Kurswert, min 25 €",
    },
    meindepot: {
      label: "meinDepot (under 26)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, toutes places allemandes : 1 € l'ordre" }),
      remark: "",
      basis:
        "page meinDepot Münchner Bank (moins de 26 ans) relue le 2026-10-26 : 1 € l'ordre sur toutes les places allemandes",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
