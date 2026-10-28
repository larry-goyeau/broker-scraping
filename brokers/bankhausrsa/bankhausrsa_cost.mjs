// What one round trip costs at Bankhaus RSA eG (DZ BANK / Atruvia online
// brokerage, OnlineBanking and VR Banking App): buy n shares on Xetra, the
// Frankfurt floor or Tradegate and sell them straight back, online, in
// dollars.
//
// Read 2026-10-26:
//   https://atruvia.scene7.com/is/content/atruvia/PA_10_2026pdf
//   Preisaushang, page 2 (Stand 01.07.2026), "Wertpapiere", "Ausführung und
//   Abwicklung des Kommissionsauftrags zum Kauf und Verkauf von",
//   "Ausführung im Inland", column "Online": "Aktien 0,50 % mind. 25,00 €";
//   "Verzinsliche Wertpapiere 0,50 % mind. 25,00 €"; "Investmentanteile über
//   Börse 1 % mind. 25,00 €" (column "Ausführung Bank" 1,00 % / 0,50 % / 1 %
//   mind. 25,00 €: not online); "Limitvormerkung, -änderung und -streichung
//   4,00 € je Auftrag", "Bei Limitvormerkung wird diese nur berechnet, wenn
//   der Auftrag nicht ausgeführt wird"; custody "jährlich 1,785 ‰ vom
//   Kurswert bzw. Nennwert", "Mindestpreis pro Depot 19,04 €".
//
// A side: shares max(25, 0.50 % × value); ETFs ("Investmentanteile über
// Börse") max(25, 1 % × value); ETCs and ETNs, listed notes with no row of
// their own, max(25, 0.50 % × value), the price of both shares and
// "Verzinsliche Wertpapiere". No cap. The venue's charges come on top,
// priced in ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt
// Transaktions- and Handelsentgelt; group "dz": 0.10 € delivery fee a side
// on Tradegate). Same on the buy and the sell.
//
// Remark: custody 0.18 % a year, at least 19.04 € a depot.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate (DZ BANK GenoFX), with no margin printed for securities: forced,
// unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: orders through the bank, foreign exchanges (online
// shares 1 % min 50 €), partial fills on different days.
//
//   node brokers/bankhausrsa/bankhausrsa_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/bankhausrsa/bankhausrsa_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SHARES = { rate: 0.005, min: 25 };
const FUNDS = { rate: 0.01, min: 25 };

const SCHEDULE = {
  broker: "Bankhaus RSA",
  folder: "bankhausrsa",
  catalogueUrl: new URL("bankhausrsa-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/PA_10_2026pdf",
  readOn: "2026-10-26",
  entity: "Bankhaus RSA eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang Bankhaus RSA (Stand 01.07.2026) relu le 2026-10-26 : Online, exécution en Allemagne, " +
    "actions, ETC et ETN 0,50 % du Kurswert min 25 €, ETF (Investmentanteile über Börse) 1 % min 25 €, plus les frais de la place",
  commission: ({ notionalEur, listing }) =>
    String(listing?.type || "").toUpperCase() === "ETF"
      ? pctFee(notionalEur, { ...FUNDS, label: "Online, Investmentanteile über Börse, Inland" })
      : pctFee(notionalEur, { ...SHARES, label: "Online, Aktien, Inland" }),
  remark: "Custody 0.18% a year, at least 19.04 € a depot.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
