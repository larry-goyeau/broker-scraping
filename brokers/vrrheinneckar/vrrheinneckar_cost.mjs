// What one round trip costs at VR Bank Rhein-Neckar eG (Mannheim, DZ BANK /
// Atruvia online brokerage): buy n shares on Xetra or the Frankfurt floor
// and sell them straight back, online, in dollars. Four order prices, so
// four plans:
//   "basis"     VR-Depot basis (also the trade price of the "Verwahrung"
//               variants of plus 25 and premium 50)
//   "plus25"    VR-Depot plus 25, variant "Handel" (members of the bank)
//   "premium50" VR-Depot premium 50, variant "Handel" (members of the bank)
//   "meindepot" meinDepot, clients aged 0 to 30
//
// Read 2026-10-26:
//   "Wertpapierdienstleistungen, Auszug aus dem Preis- und
//   Leistungsverzeichnis vom 1. Februar 2026", 9.2.1 "Kauf und Verkauf
//   (Provision)", column "online", Aktien: VR-Depot basis "0,40 %", plus 25
//   Verwahrung "0,40 %", plus 25 Handel "0,30 %", premium 50 Verwahrung
//   "0,40 %", premium 50 Handel "0,20 %", each "zzgl. Abrechungspreis pro
//   Transaktion 9,90 EUR"; meinDepot (0 - 30 Jahre) "Transaktionen über
//   Tradegate und Qutrix 4,95 EUR je Transaktion", "Transaktionen über andere
//   Handelsplätze 9,90 EUR je Transaktion". 9.2.2 "börsengehandelte Fonds
//   wie Aktien"; the "Aktien" class also holds certificates, so ETCs and ETNs
//   take it too. "Zusätzlich wird die Bank die ihr bei der
//   Auftragsausführung und -abwicklung von Dritten berechneten Auslagen und
//   fremden Kosten in Rechnung stellen." "Limitvormerkung, -änderung und
//   -streichung 8,90 EUR pro Auftrag", only "wenn der Auftrag nicht
//   ausgeführt wird". 9.1 Service- und Beratungspauschale a month: basis
//   0,99 EUR, plus 25 4,99 EUR, premium 50 29,99 EUR, meinDepot 0,00 EUR.
//   9.3.1 custody: 0,20 % p.a. (Handel variants and basis), meinDepot
//   0,00 %:
//   https://atruvia.scene7.com/is/content/atruvia/WP-Dienstleistungenpdf
//   The depot models page prints the same figures ("Transaktion online
//   Aktien 0,40 %" ... "zzgl. Abrechungspreis pro Transaktion 9,90 EUR"):
//   https://www.vrbank.de/privatkunden/geldanlage-und-sparen/boerse-und-wertpapiere/depotmodelle.html
//   VR-Prima-Depot is "nur Bestand": not a row.
//
// A side: rate × value + 9.90 €, no minimum or cap (basis 0.40 %, plus 25
// 0.30 %, premium 50 0.20 %); meinDepot 9.90 € on Xetra and Frankfurt (the
// catalogue's venues), and 4.95 € on Tradegate or Quotrix, which is a
// remark. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz"). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate set by "ein
// Verfahren ..., bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist", no margin printed: N/A. Taxes (French, Italian,
// Spanish FTT on the buy) from taxMap.mjs. Left out: branch orders (1,00 %),
// partial fills on different days ("wie ein gesonderter Auftrag").
//
//   node brokers/vrrheinneckar/vrrheinneckar_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrrheinneckar/vrrheinneckar_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SETTLEMENT = 9.9; // Abrechnungspreis pro Transaktion
const MEINDEPOT = 9.9; // other venues than Tradegate and Quotrix
const MEINDEPOT_TRADEGATE = 4.95;

const online = (rate, label) => ({ notionalEur }) =>
  pctFee(notionalEur, { base: SETTLEMENT, rate, label: `${label}, online, Aktien` });

function tradegateRemark({ venue }) {
  if (venue.mic === "XGAT") return "";
  const pct = Math.round((100 * (MEINDEPOT - MEINDEPOT_TRADEGATE)) / MEINDEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "VR Bank Rhein-Neckar",
  folder: "vrrheinneckar",
  catalogueUrl: new URL("vrrheinneckar-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/WP-Dienstleistungenpdf",
  readOn: "2026-10-26",
  entity: "VR Bank Rhein-Neckar eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "basis",
  plans: {
    basis: {
      label: "VR-Depot basis",
      commission: online(0.004, "VR-Depot basis"),
      remark: "Custody 0.20% a year plus 0.99 € a month.",
      basis:
        "PLV VR Bank Rhein-Neckar du 1er février 2026, 9.2.1, VR-Depot basis, online, Aktien : " +
        "0,40 % du Kurswert + Abrechnungspreis 9,90 €, relu le 2026-10-26",
    },
    plus25: {
      label: "VR-Depot plus 25 Handel",
      commission: online(0.003, "VR-Depot plus 25 Handel"),
      remark: "Custody 0.20% a year plus 4.99 € a month.",
      basis:
        "PLV VR Bank Rhein-Neckar du 1er février 2026, 9.2.1, VR-Depot plus 25 Handel (membres), online, Aktien : " +
        "0,30 % du Kurswert + Abrechnungspreis 9,90 €, relu le 2026-10-26",
    },
    premium50: {
      label: "VR-Depot premium 50 Handel",
      commission: online(0.002, "VR-Depot premium 50 Handel"),
      remark: "Custody 0.20% a year plus 29.99 € a month.",
      basis:
        "PLV VR Bank Rhein-Neckar du 1er février 2026, 9.2.1, VR-Depot premium 50 Handel (membres), online, Aktien : " +
        "0,20 % du Kurswert + Abrechnungspreis 9,90 €, relu le 2026-10-26",
    },
    meindepot: {
      label: "meinDepot (0-30)",
      commission: ({ venue }) =>
        venue.mic === "XGAT"
          ? { eur: MEINDEPOT_TRADEGATE, note: "meinDepot, Transaktionen über Tradegate : 4,95 €" }
          : { eur: MEINDEPOT, note: "meinDepot, Transaktionen über andere Handelsplätze : 9,90 €" },
      remark: tradegateRemark,
      basis:
        "PLV VR Bank Rhein-Neckar du 1er février 2026, 9.2.1, meinDepot (0 - 30 ans) : 9,90 € l'ordre, " +
        "4,95 € via Tradegate ou Quotrix, relu le 2026-10-26",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
