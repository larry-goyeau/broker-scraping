// What one round trip costs at Volksbank in Südwestfalen eG (DZ BANK /
// Atruvia online brokerage): buy n shares on Xetra, the Frankfurt floor or
// Tradegate and sell them straight back, online, in dollars. Two depots by
// age with different order prices, so two plans.
//
// Read 2026-10-26:
//   meinDepot Classic page ("für Kunden ab 31 Jahre"): "Wertpapier-Order
//   online 15,90 EUR Flatpreis pro Order"; "Wertpapier-Order telef. oder
//   persönlich bis 14.999,99 EUR 0,99 % vom Kurswert zzgl. 19,95 EUR
//   Grundpreis pro Order" (not this trip); "Aufpreis ausländische Börsen
//   online, telef. oder persönlich 25,00 EUR pro Order"; "Limitvormerkung,
//   -änderung und -streichung kostenfrei"; custody "Depotentgelt (inkl.
//   USt.) 0,190 % p.a. vom Kurswert, mind. 4,95 EUR pro Quartal, pro Depot":
//   https://www.vbinswf.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot-classic.html
//   meinDepot page ("für alle zwischen 18 und einschließlich 30 Jahren"):
//   "Kostenfreie Depotführung", "Pauschale Ordergebühren für alle
//   inländischen Börsenplätze von nur 3,95 Euro je Orderauftrag":
//   https://www.vbinswf.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   The bank's legal page links no Preisaushang; these product pages are
//   the published price.
//
// Plans (one row each, `query.plan`), a side:
//   classic    15.90 € flat
//   meindepot  3.95 € flat on every German venue (age 18 to 30)
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy and
// the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by DZ BANK at its
// GenoFX rate, no margin printed for securities: N/A. Taxes (French,
// Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: phone and
// branch orders, foreign exchanges (+25 €), partial fills on different days.
//
//   node brokers/volksbankinsudwe/volksbankinsudwe_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankinsudwe/volksbankinsudwe_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "Volksbank in Südwestfalen",
  folder: "volksbankinsudwe",
  catalogueUrl: new URL("volksbankinsudwe-parsed.json", import.meta.url),
  url: "https://www.vbinswf.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot-classic.html",
  readOn: "2026-10-26",
  entity: "Volksbank in Südwestfalen eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "classic",
  plans: {
    classic: {
      label: "meinDepot Classic",
      commission: () => ({ eur: 15.9, note: "meinDepot Classic, Wertpapier-Order online : 15,90 € l'ordre" }),
      remark: "Custody 0.19% a year (at least 4.95 € a quarter).",
      basis:
        "page meinDepot Classic de la Volksbank in Südwestfalen relue le 2026-10-26 : " +
        "Wertpapier-Order online 15,90 € l'ordre (forfait)",
    },
    meindepot: {
      label: "meinDepot (18 to 30)",
      commission: () => ({ eur: 3.95, note: "meinDepot, toutes places allemandes : 3,95 € l'ordre" }),
      remark: "",
      basis:
        "page meinDepot de la Volksbank in Südwestfalen relue le 2026-10-26 (18 à 30 ans) : " +
        "3,95 € l'ordre sur toutes les places allemandes",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
