// What one round trip costs at EDEKABANK AG (Hamburg) in the EDEKA-Depot
// Aktiv: buy n shares on Xetra, the Frankfurt floor or Tradegate online
// (OnlineBanking / MyBanking App, the cooperative banks' DZ BANK brokerage)
// and sell them straight back, in dollars.
//
// https://atruvia.scene7.com/is/content/atruvia/wertpapiergeschaeft_preis_und_leistungsverzeichnis_20260115
// read on 2026-10-26, Preis- und Leistungsverzeichnis Stand 15.01.2026,
// 9.1.1.1, column "Onlinegeschäft": "Provision vom Kurswert - mind. 9,95 EUR
// im Inland"; shares, warrants, "Investmentanteile über Börse, sonstige
// Wertpapiere": "0,20 % vom Kurswert max. 59,95 EUR". "Zusätzlich wird die
// Bank die ihr bei der Auftragsausführung und -abwicklung von Dritten
// berechneten Auslagen und fremden Kosten in Rechnung stellen." The same
// figures on the depot page:
// https://www.edekabank.de/privatkunden/geldanlage/depot-brokerage/edeka-depot_aktiv.html
// The "Beratungsgeschäft" column (1,00 % ..., min 25 €) is not online. The
// "Pauschalpreismodell EDEKA-Depot Premium" (0,69 % p.a. of the depot, min
// 100 €) is a custody price, not this trip.
//
// Formula, a side: 0,20 % × Kurswert, at least 9,95 €, at most 59,95 €;
// plus, from ../1822direkt/germanyCost.mjs, the Xetra Transaktionsentgelt
// (Basic, 0,72 bp, min 0,90 €), the Frankfurt Transaktionsentgelt (1,44 bp,
// min 0,90 €) + Handelsentgelt (5,04 bp, min 2,52 €), or on Tradegate the
// DZ group's Übertragungs-/Liefergebühr 0,10 €; the book; the FR/IT/ES FTT
// on the buy (taxMap).
//
// FX: euro account. For a non-euro line "wird der Wechselkurs durch ein
// Verfahren ermittelt, bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist": no margin printed, so a forced FX and N/A.
// Custody 0,05 % a year (min 9,95 € a depot, 4 € a holding): small, no remark.
// Left out: online limit changes (free), "mind. 34,95 EUR im Ausland"
// (another place), partial fills on other days.
//
//   node brokers/edekabank/edekabank_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "Edekabank",
  folder: "edekabank",
  catalogueUrl: new URL("edekabank-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/wertpapiergeschaeft_preis_und_leistungsverzeichnis_20260115",
  readOn: "2026-10-26",
  entity: "EDEKABANK AG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "PLV EDEKABANK Stand 15.01.2026, 9.1.1.1, Onlinegeschäft : 0,20 % du Kurswert, min 9,95 € (Inland), max 59,95 €",
  commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.002, min: 9.95, max: 59.95, label: "Onlinegeschäft" }),
  remark: "",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
