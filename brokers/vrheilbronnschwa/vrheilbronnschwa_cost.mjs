// What one round trip costs at VR Bank Heilbronn Schwäbisch Hall eG (DZ BANK
// / Atruvia online brokerage, OnlineBanking and VR Banking App): buy n shares
// on Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars. Two order prices, so two plans:
//   "standard"  VR-Depot Flexibel and VR-Depot Direkt (same online price)
//   "meindepot" meinDepot, up to the client's 31st birthday
//
// Read 2026-10-26:
//   https://atruvia.scene7.com/is/content/atruvia/PLV-01-07-2026pdf
//   Preis- und Leistungsverzeichnis, Stand 01.07.2026, 9.1.1 "Kauf und
//   Verkauf (Provision)" in "VR-DepotFlexibel", "VR-DepotDirekt",
//   "Ausführung im Inland", column "Online-Brokerage Provision pro Order ab
//   einem Kurswert von 10,00 €", Aktien to "Investmentanteile über Börse"
//   and "Sonstige Wertpapiere": "Grundpreis 9,90 €", "0,25% vom Kurswert",
//   "Maximalpreis (Grundpreis zzgl. Provision): 49,90 €" (through staff
//   19,90 € + 0,75 % / 0,50 %: not online). meinDepot "(Bis zu Vollendung
//   des 31. Lebensjahres)", Online-Brokerage, Inland: "Orderpauschale für
//   inländische Best-Execution Orders 3,95 € pro Order", "Orderpauschale für
//   alle inländischen Börsenplätze 4,95 € pro Order". "Zusätzlich wird die
//   Bank die ihr bei der Auftragsausführung und -abwicklung von Dritten
//   berechneten Auslagen und fremden Kosten ... in Rechnung stellen";
//   "Limitvormerkung, -änderung und -streichung frei". 9.2.1 custody:
//   VR-Depot Flexibel 18,00 € + 18,00 € p.a.; VR-Depot Direkt 0,00 € "ab 2
//   Orders p.a."; meinDepot 0,00 €.
//   The depot page shows the same figures ("9,90 € + 0,25 % vom Kurswert,
//   max. 49,90 €"; "3,95 € (ohne Best-Ex = 4,95 €)"):
//   https://www.vrbank-hsh.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//
// A side: standard min(49.90, 9.90 + 0.25 % × value); meinDepot 4.95 €. A
// catalogue row is an order on its own venue (gemäß Weisung), so meinDepot
// takes the 4.95 € price and the 3.95 € Best Execution price is a remark
// "Fees might be x% lower.", x = the cut of the 4.95 € order price
// (1 € / 4.95 €, the same on both legs). The same for shares, ETFs,
// ETCs and ETNs. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt Transaktions- and
// Handelsentgelt; group "dz": 0.10 € delivery fee a side on Tradegate). Same
// on the buy and the sell. Custody is not a remark: VR-Depot Direkt is free
// from two orders a year, and a round trip is two.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate "durch ein
// Verfahren ermittelt, bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist" (PLV 9.1.1; DZ BANK GenoFX, 4.6), no margin printed:
// forced, unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the
// buy) from taxMap.mjs. Left out: orders through staff, foreign exchanges
// (online 34,90 € + 0,25 %, max 74,90 €), DZ BANK derivatives, orders under
// 10 € Kurswert, partial fills on different days.
//
//   node brokers/vrheilbronnschwa/vrheilbronnschwa_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrheilbronnschwa/vrheilbronnschwa_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const ONLINE = { base: 9.9, rate: 0.0025, max: 49.9 };
const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;

function meinDepotRemark() {
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "VR Bank Heilbronn Schwäbisch Hall",
  folder: "vrheilbronnschwa",
  catalogueUrl: new URL("vrheilbronnschwa-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/PLV-01-07-2026pdf",
  readOn: "2026-10-26",
  entity: "VR Bank Heilbronn Schwäbisch Hall eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "standard",
  plans: {
    standard: {
      label: "VR-Depot",
      commission: ({ notionalEur }) => pctFee(notionalEur, { ...ONLINE, label: "Online-Brokerage Inland" }),
      remark: "",
      basis:
        "PLV VR Bank Heilbronn Schwäbisch Hall Stand 01.07.2026, 9.1.1, VR-Depot Flexibel / Direkt, Online-Brokerage Inland : " +
        "9,90 € + 0,25 % du Kurswert, max 49,90 €, plus les frais de la place",
    },
    meindepot: {
      label: "meinDepot (under 31)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Orderpauschale alle inländischen Börsenplätze : 4,95 €" }),
      remark: meinDepotRemark,
      basis:
        "PLV VR Bank Heilbronn Schwäbisch Hall Stand 01.07.2026, 9.1.1, meinDepot (jusqu'à 31 ans) : 4,95 € l'ordre sur toute " +
        "place allemande, 3,95 € en Best Execution, plus les frais de la place",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
