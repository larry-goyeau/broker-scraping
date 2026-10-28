// What one round trip costs at BIB - Bank im Bistum Essen eG in its BIB
// Direkt-Depot (DZ BANK / Atruvia brokerage in OnlineBanking and the VR
// Banking App): buy n shares on Xetra and sell them straight back, online,
// in dollars.
//
// Read 2026-10-26, Wertpapierdepot page, "Depotmodell, Konditionen und
// Gebühren", "Anleihen, Aktien, Optionsscheine, fremde Zertifikate,
// börsengehandelte Investmentfonds", column "BIB Direkt-Depot Kauf / Verkauf
// Brokerage", "Börsenkommissionsgeschäft national": "bis 10,00 €" "3,00 €";
// "bis 4.999,99 €", "bis 24.999,99 €", "ab 25.000,00 €" each "0,25% vom
// Kurswert, mind. 9,90 €". "Ggf. zzgl. fremder Spesen und weiterer Kosten
// (handelsplatzabhängige Entgelte ...)". Custody "Jahrespauschale pro Depot
// zzt. frei"; "Orderstreichung (manuell veranlasst) zzt. frei":
//   https://www.bib-fairbanking.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
// The BIB Direkt-Depot is the only model the page offers.
//
// A side: 3,00 € for a Kurswert up to 10 €, otherwise 0,25 % × Kurswert, at
// least 9,90 €, no cap. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz"). Same on the buy and the sell.
//
// Cash is euro only. A non-euro line is converted "zum aktuellen
// Devisengeld- bzw. Devisenbriefkurs des Abrechnungstages" with no spread
// printed: forced and unpublished, N/A. Taxes (French, Italian, Spanish FTT
// on the buy) from taxMap.mjs. Left out: "Börsenkommissionsgeschäft
// international 45,00 € Stückpreis" (another place), funds and DZ BANK
// certificates bought off exchange, partial fills on different days (billed
// one by one, but Xetra partial fills at one price and day are merged).
//
//   node brokers/bibimbistumessen/bibimbistumessen_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "BIB - Bank im Bistum Essen",
  folder: "bibimbistumessen",
  catalogueUrl: new URL("bibimbistumessen-parsed.json", import.meta.url),
  url: "https://www.bib-fairbanking.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "BIB - Bank im Bistum Essen eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "page Wertpapierdepot BIB relue le 2026-10-26, BIB Direkt-Depot, Brokerage, Börsenkommissionsgeschäft national : " +
    "3,00 € jusqu'à 10 € de Kurswert, sinon 0,25 % du Kurswert, min 9,90 €, sans plafond",
  commission: ({ notionalEur }) =>
    notionalEur <= 10
      ? { eur: 3, note: "Börsenkommissionsgeschäft national, Kurswert bis 10,00 € : 3,00 €" }
      : pctFee(notionalEur, { rate: 0.0025, min: 9.9, label: "Börsenkommissionsgeschäft national" }),
  remark: "",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
