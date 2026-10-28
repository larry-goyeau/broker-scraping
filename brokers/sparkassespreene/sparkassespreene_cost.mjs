// What one round trip costs at Sparkasse Spree-Neiße: buy n shares on Xetra
// or the Frankfurt floor with an online order and sell them straight back,
// in dollars.
//
// Read 2026-10-26:
//   Preisaushang Stand 15. Okt. 2026, "Wertpapiere": "Wertpapierorder Online
//   * Handel an Inlands-/Auslandsbörsen 0,50% v. Kurswert, mind. 10,00 €,
//   zzgl. Courtage und Fremdkosten"; "Depotverwaltung: * Mindestpreis pro
//   Jahr 20,00 € inkl. MwSt.", "* Girosammelverwahrung je WKN, pro Jahr
//   0,125% vom Kurswert inkl. MwSt.":
//   https://www.sparkasse-spree-neisse.de/content/dam/myif/sk-spree-neisse/work/dokumente/pdf/preise-leistungen/preisaushang.pdf
//   No cap is printed.
//
// A side: max(10, 0.50 % × value). The "Courtage und Fremdkosten" are the
// venue's charges, priced in ../1822direkt/germanyCost.mjs from Deutsche
// Börse's list (on Frankfurt the Handelsentgelt; group "sparkasse"; this
// catalogue has no Tradegate line). Same on the buy and the sell.
//
// Remark: custody, 0.125 % a year per holding in Girosammelverwahrung, at
// least 20 € a year.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate the
// Sparkasse does not print: forced, unpublished FX, N/A. Taxes (French,
// Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: branch orders
// (1.00 %, min 25 €), partial fills on different days.
//
//   node brokers/sparkassespreene/sparkassespreene_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/sparkassespreene/sparkassespreene_cost.mjs IE00B4L5Y983 XFRA EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "Sparkasse Spree-Neiße",
  folder: "sparkassespreene",
  catalogueUrl: new URL("sparkassespreene-parsed.json", import.meta.url),
  url: "https://www.sparkasse-spree-neisse.de/content/dam/myif/sk-spree-neisse/work/dokumente/pdf/preise-leistungen/preisaushang.pdf",
  readOn: "2026-10-26",
  entity: "Sparkasse Spree-Neiße (DE)",
  group: "sparkasse",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang Sparkasse Spree-Neiße du 15.10.2026 relu le 2026-10-26 : Wertpapierorder Online, " +
    "0,50 % du Kurswert, min 10 €, plus la courtage et les frais de la place",
  commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.005, min: 10, label: "Wertpapierorder Online" }),
  remark: "Custody 0.125% a year, at least 20 €.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
