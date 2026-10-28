// What one round trip costs at Volksbank Darmstadt Mainz (a Volksbank on the
// DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars. Two
// online order prices, so two plans:
//   "direkt"    DirektDepot ("Online-Kunden und Selbstentscheider"); the
//               KlassikDepot, ExklusivDepot and EinsteigerDepot have the
//               same online price
//   "meindepot" meinDepot, clients under 31 (the Preisaushang: "Für Kinder,
//               Schülerinnen und Schüler, Auszubildende und Studierende bis
//               maximal 30 Jahre")
//
// Read 2026-10-26:
//   Preisaushang Stand 01.10.2026, p. 2, "Wertpapiere", "Online-Order":
//     "Orderpauschale Inland" 9,90 € (Einsteiger, Klassik, Exklusiv,
//     Direkt), "zzgl. Orderentgelt, auf Kurswert 0,25 % max. 49,90 €";
//     meinDepot 4,90 €, "zzgl. Orderentgelt 0,00 %";
//     "Orderpauschale für inländische Best Execution Orders": meinDepot
//     3,95 €, the other depots 9,90 € ("s. unten" / 9,90 €).
//   Custody: DirektDepot 0,00 € ("mindestens drei Orders pro Quartal, sonst
//   Abrechnung wie unser KlassikDepot": 3,90 € a quarter plus 0,04 % a
//   quarter, "0,16 % p.a."); meinDepot 0,00 €.
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushang%20Voba%20Darmstadt%20Mainz%20ab%2001.10.2026_zweiseitigpdf
//   The same figures on the depot comparison page ("max. 49,90 Euro" under
//   the 0,25 %), footnote 3 for the DirektDepot condition:
//   https://www.volksbanking.de/privatkunden/depot-wertpapiere/depot-brokerage/depots/depotmodelle.html
//   and on the meinDepot page ("Stand der Konditionen 01.07.2026"):
//   https://www.volksbanking.de/privatkunden/depot-wertpapiere/depot-brokerage/depots/meindepot.html
//
// The 49.90 € cap is printed under the "Orderentgelt" line, so it caps the
// 0.25 % only: a side 9.90 € + min(49.90, 0.25 % × value), at most 59.80 €.
// meinDepot: 4.90 € a side for an order on its own venue ("gemäß Weisung",
// which every catalogue row is); the 3.95 € Best Execution price (DZ BANK
// then picks Quotrix, Tradegate, Xetra, Frankfurt or Stuttgart) is the remark
// "Fees might be x% lower ...", x = 0.95 € over 4.90 €, 19%. The
// venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy and
// the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// adviser and phone orders, foreign exchanges, the reduced 4.90 € for DZ
// BANK certificates and warrants (not in the catalogue), partial fills on
// different days.
//
//   node brokers/volksbankdarmsta/volksbankdarmsta_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//   node brokers/volksbankdarmsta/volksbankdarmsta_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, euro, printCli } from "../1822direkt/germanyCost.mjs";

const BEST_EXECUTION = 3.95;
const MEINDEPOT = 4.9;
const ORDER = { base: 9.9, rate: 0.0025, max: 49.9 };

function direkt({ notionalEur }) {
  const variable = Math.min(ORDER.max, ORDER.rate * notionalEur);
  const eur = ORDER.base + variable;
  return {
    eur,
    note: `Orderpauschale Inland ${euro(ORDER.base)} € + Orderentgelt 0,25 % (max ${euro(ORDER.max)} €) ${euro(variable)} € → ${euro(eur)} €`,
  };
}

function bestExecutionRemark({ notionalEur }) {
  if (!(notionalEur > 0)) return "";
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower if sent as a Best Execution order.`;
}

export const PLANS = {
  direkt: {
    label: "DirektDepot",
    commission: direkt,
    remark: "Custody 0.16% a year plus 15.60 € unless 3 orders a quarter.",
    basis:
      "Preisaushang Volksbank Darmstadt Mainz Stand 01.10.2026 relu le 2026-10-26 : Online-Order, Orderpauschale " +
      "Inland 9,90 € + Orderentgelt 0,25 % (max 49,90 €)",
  },
  meindepot: {
    label: "meinDepot (under 31)",
    commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Orderpauschale Inland : 4,90 € l'ordre" }),
    remark: bestExecutionRemark,
    basis:
      "Preisaushang Volksbank Darmstadt Mainz Stand 01.10.2026 relu le 2026-10-26 : meinDepot (moins de 31 ans), " +
      "Orderpauschale Inland 4,90 €, 3,95 € en Best Execution",
  },
};

const SCHEDULE = {
  broker: "Volksbank Darmstadt Mainz",
  folder: "volksbankdarmsta",
  catalogueUrl: new URL("volksbankdarmsta-parsed.json", import.meta.url),
  url: "https://www.volksbanking.de/privatkunden/depot-wertpapiere/depot-brokerage/depots/depotmodelle.html",
  readOn: "2026-10-26",
  entity: "Volksbank Darmstadt Mainz eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  plans: PLANS,
  defaultPlan: "direkt",
};

export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
