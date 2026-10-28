// What one round trip costs at VR Bank RheinAhrEifel (a Volksbank on the DZ
// BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars. Four
// online order prices, so four plans:
//   "online"    VR-Depot Online
//   "klassik"   VR-Depot Klassik
//   "premium"   VR-Depot Premium
//   "meindepot" meinDepot, "Für Kunden unter 31 Jahre, anschließend
//               Konditionen wie VR-Depot Online"
//
// Read 2026-10-26:
//   https://www.vr-rheinahreifel.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Online Transaktionen": Grundpreis 6,90 € (Online), 14,90 € (Klassik),
//   14,90 € (Premium); "Variable Gebühren 0,40 % (Renten: 0,20 %)", "0,50 %
//   (Renten: 0,25 %)", "0,30 % (Renten: 0,15 %)"; meinDepot "Orderpauschale
//   für alle inländischen Börsen 4,90 €", "Orderpauschale für inländische
//   Best Execution-Orders 3,95 €"; "Aufschlag ausländische Börsen +20 €";
//   "Orders unter 10 Euro sind nicht provisionspflichtig". Custody: VR-Depot
//   Online "inklusive*" ("Mind. 1 provisionspflichtige, börsliche Online
//   Order pro Quartal ... Ansonsten Depotführung wie VR-Depot Klassik":
//   0,025 % a month under 200 T€, at least 3,90 € a month); Premium 0,030 %
//   a month, at least 12,90 €; meinDepot free.
//   Preisaushang Stand 01.10.2026, p. 3, "Online Brokerage Inland", "Aktien /
//   verzinsliche Wertpapiere Provision vom Kurswert": VR-Depot Online "0,40 %
//   / 0,20 % zzgl. 6,90 EUR", Klassik "0,50 % / 0,25 % zzgl. 14,90 EUR",
//   Premium "0,30 % / 0,15 % zzgl. 14,90 EUR", meinDepot "4,90 EUR 7) / 3,95
//   EUR 8)" (7 "Börsenplatz alle", 8 "alle inländischen Börsenplätze (als
//   Best Execution ausgeführt)"); "Limitvormerkung ... 0,00 EUR":
//   https://atruvia.scene7.com/is/content/atruvia/20261001_Preisaushangpdf
//
// ETFs, ETCs and ETNs are not "Renten": they pay the share rate. A side:
// online 6.90 € + 0.40 %; klassik 14.90 € + 0.50 %; premium 14.90 € +
// 0.30 %; meinDepot 4.90 € for an order on its own venue ("Börsenplatz
// alle", which every catalogue row is); nothing under 10 € of value. The
// 3.95 € Best Execution price (DZ BANK then picks Quotrix, Tradegate, Xetra,
// Frankfurt or Stuttgart) is the remark "Fees might be x% lower ...", x =
// the cut of the 4.90 € order price itself (19). No minimum or cap is
// printed. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side on
// Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// offline orders (1.00-1.20 % + 24.90-34.90 €), the flat-fee VR-Depot Flat
// (0.1125 % of the depot a month, at least 225 € a month, orders included:
// custody, not a trade price), partial fills on different days.
//
//   node brokers/vrrheinahreifel/vrrheinahreifel_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//   node brokers/vrrheinahreifel/vrrheinahreifel_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, euro, printCli } from "../1822direkt/germanyCost.mjs";

const FREE_BELOW = 10;
const BEST_EXECUTION = 3.95;
const MEINDEPOT = 4.9;

const free = (v) =>
  v < FREE_BELOW ? { eur: 0, note: `ordre de moins de ${euro(FREE_BELOW)} € : pas de provision` } : null;

const online = (base, rate, label) => ({ notionalEur }) =>
  free(notionalEur) || pctFee(notionalEur, { base, rate, label });

function bestExecutionRemark({ notionalEur }) {
  if (!(notionalEur >= FREE_BELOW)) return "";
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower if sent as a Best Execution order.`;
}

const BASIS = "barème VR Bank RheinAhrEifel relu le 2026-10-26 (page Wertpapierdepot et Preisaushang du 01.10.2026)";

export const PLANS = {
  online: {
    label: "VR-Depot Online",
    commission: online(6.9, 0.004, "Online Brokerage VR-Depot Online"),
    remark: "Custody 0.30% a year (at least 46.80 €) unless one paid online order a quarter.",
    basis: `${BASIS} : VR-Depot Online, 6,90 € + 0,40 % du Kurswert`,
  },
  klassik: {
    label: "VR-Depot Klassik",
    commission: online(14.9, 0.005, "Online Brokerage VR-Depot Klassik"),
    remark: "Custody 0.30% a year, at least 46.80 €.",
    basis: `${BASIS} : VR-Depot Klassik, 14,90 € + 0,50 % du Kurswert`,
  },
  premium: {
    label: "VR-Depot Premium",
    commission: online(14.9, 0.003, "Online Brokerage VR-Depot Premium"),
    remark: "Custody 0.36% a year, at least 154.80 €.",
    basis: `${BASIS} : VR-Depot Premium, 14,90 € + 0,30 % du Kurswert`,
  },
  meindepot: {
    label: "meinDepot (under 31)",
    commission: ({ notionalEur }) =>
      free(notionalEur) || { eur: MEINDEPOT, note: "meinDepot, Börsenplatz alle : 4,90 € l'ordre" },
    remark: bestExecutionRemark,
    basis: `${BASIS} : meinDepot (moins de 31 ans), 4,90 € l'ordre sur une place désignée, 3,95 € en Best Execution`,
  },
};

const SCHEDULE = {
  broker: "VR Bank RheinAhrEifel",
  folder: "vrrheinahreifel",
  catalogueUrl: new URL("vrrheinahreifel-parsed.json", import.meta.url),
  url: "https://www.vr-rheinahreifel.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR Bank RheinAhrEifel eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  plans: PLANS,
  defaultPlan: "online",
};

export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
