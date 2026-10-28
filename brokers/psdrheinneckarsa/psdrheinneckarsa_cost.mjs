// What one round trip costs at PSD Bank RheinNeckarSaar eG: buy n shares on
// Xetra, the Frankfurt floor or Tradegate through PSD Brokerage - Internet
// (PSD OnlineBanking / PSD Banking-App, the cooperative banks' DZ BANK
// brokerage) and sell them straight back, in dollars.
//
// https://atruvia.scene7.com/is/content/atruvia/134200-Preis-und-Leistungsverzeichnispdf
// read on 2026-10-26, Preis- und Leistungsverzeichnis Stand 01.09.2026:
//   9.1.1, "Weitere entgeltpflichtige Dienstleistungen" (the Online-
//   Brokerage column of the table points there): "Wertpapieraufträge
//   mittels PSD Brokerage - Internet (ohne Beratung): mindestens 9,90 EUR,
//   0,25% vom Kurs-/Nennwert maximal 60,00 EUR". "Zusätzlich wird die Bank
//   die ihr bei der Auftragsausführung und -abwicklung von Dritten
//   berechneten Auslagen und fremden Kosten in Rechnung stellen."
//   9.2.1, "meinDepot & meinDepot für Kids": "Orderpauschale für
//   inländische Best-Execution Orders: 3,95 EUR", "Orderpauschale alle
//   inländischen Börsen: pauschal 4,95 EUR"; "Sonderkondition mein Depot für
//   junge Kunden (bis 30 Jahre): ab Alter von 31 Jahren erfolgt Umstellung
//   auf Konditionen 'Standarddepot'".
// The table's 0,60 % / min 30 € / max 75 € column and "PSD Brokerage -
// Telefon" are not online. "meinDepot Premium" is a flat custody fee
// (1,19 % p.a. ..., 25 trades included), not this trip.
//
// Plans (one row each, `query.plan`):
//   standard   0,25 % × Kurswert, at least 9,90 €, at most 60 €, a side.
//   meindepot  4,95 € a side ("alle inländischen Börsen"). A catalogue row
//              is an order on its own venue, so the 3,95 € Best Execution
//              price is a remark ("Fees might be x% lower.").
// On top, per side, from ../1822direkt/germanyCost.mjs: Xetra
// Transaktionsentgelt (Basic, 0,72 bp, min 0,90 €), Frankfurt
// Transaktionsentgelt (1,44 bp, min 0,90 €) + Handelsentgelt (5,04 bp, min
// 2,52 €), Tradegate DZ-group Liefergebühr 0,10 €; the book; the FR/IT/ES
// FTT on the buy (taxMap).
//
// FX: euro account. PLV 4.6 sets currency rates from DZ BANK's GenoFX
// (www.genofx.dzbank.de) and 9.1.1 only says the rate for securities is
// "marktgerecht": no margin printed, so a non-euro line is a forced,
// unpublished FX and N/A.
// Custody (9.2.1): every rate 0,00 but "Mindestpreis pro Depot (inkl. USt)
// jährlich pauschal 29,00 EUR" in the standard depot (meinDepot: 0,00 EUR):
// a remark on the standard plan.
// Left out: online limit fees (0 €), partial fills on other days.
//
//   node brokers/psdrheinneckarsa/psdrheinneckarsa_cost.mjs DE0007164600 XGAT EUR --shares=4 --price=215
//   node brokers/psdrheinneckarsa/psdrheinneckarsa_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;

// The Best Execution price's cut of the 4,95 € order price itself: 20 %.
function meinDepotRemark() {
  return `Fees might be ${Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT)}% lower.`;
}

const SCHEDULE = {
  broker: "PSD Bank RheinNeckarSaar",
  folder: "psdrheinneckarsa",
  catalogueUrl: new URL("psdrheinneckarsa-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/134200-Preis-und-Leistungsverzeichnispdf",
  readOn: "2026-10-26",
  entity: "PSD Bank RheinNeckarSaar eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "standard",
  plans: {
    standard: {
      label: "PSD Brokerage",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { rate: 0.0025, min: 9.9, max: 60, label: "PSD Brokerage - Internet" }),
      remark: "Custody is at least 29 € a year.",
      basis:
        "PLV PSD Bank RheinNeckarSaar Stand 01.09.2026, 9.1.1 : PSD Brokerage - Internet 0,25 % du Kurswert, min 9,90 €, max 60 €",
    },
    meindepot: {
      label: "meinDepot (up to 30)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Orderpauschale alle inländischen Börsen : 4,95 €" }),
      remark: meinDepotRemark,
      basis:
        "PLV PSD Bank RheinNeckarSaar Stand 01.09.2026, 9.2.1, meinDepot (jusqu'à 30 ans) : 4,95 € l'ordre sur toute place allemande, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
