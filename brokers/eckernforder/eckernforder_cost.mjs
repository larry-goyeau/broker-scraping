// What one round trip costs at Eckernförder Bank eG Volksbank-Raiffeisenbank
// (DZ BANK / Atruvia online brokerage): buy n shares on Xetra or the
// Frankfurt floor and sell them straight back, online, in dollars.
//
// Read 2026-10-26:
//   Preis- und Leistungsverzeichnis, Stand 01.10.2026, 9.1.1 "Kauf und
//   Verkauf (Provision)", p. 49, "Ausführung im Inland (Standardgeschäft)",
//   footnote 138 "Ordererteilung über die Bank bzw. VR-ProfiBroker" (the
//   bank prints one price for every channel, no separate online column):
//     Aktien (inkl. Neuemissionen)   1,00 %, Minimum 25,00 EUR
//     Investmentanteile über Börse   0,50 %, Minimum 25,00 EUR
//     Sonstige Wertpapiere           1,00 %, Minimum 25,00 EUR
//   "Zusätzlich wird die Bank die ihr bei der Auftragsausführung und
//   -abwicklung von Dritten berechneten Auslagen und fremden Kosten in
//   Rechnung stellen."
//   https://atruvia.scene7.com/is/content/atruvia/7557-plvpdf
//   The depot page prints the same rates ("Aktien, Optionsscheine, sonstige
//   Wertpapiere: Ausführung im Inland 1,00 % vom Kurswert mind. 25,00 Euro";
//   "Investmentanteile über Börse 0,50 % vom Kurswert mind. 25,00 Euro") and
//   the custody, 1.79 ‰ a year (Girosammelverwahrung), at least 6.40 € a
//   line and 15.40 € a depot:
//   https://www.eckernfoerder-bank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//
// A side: shares max(25, 1.00 % × value); ETFs ("Investmentanteile über
// Börse") max(25, 0.50 % × value); ETCs and ETNs are not shares or fund
// units: "Sonstige Wertpapiere", max(25, 1.00 % × value). The venue's
// charges come on top, priced in ../1822direkt/germanyCost.mjs (group "dz").
// Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at a "marktgerecht"
// rate (PLV 9.1.1; DZ BANK's GenoFX rates, PLV 5) with no margin printed for
// securities: N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: foreign exchanges, partial fills on different days.
//
//   node brokers/eckernforder/eckernforder_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//   node brokers/eckernforder/eckernforder_cost.mjs IE00B4L5Y983 XFRA EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const RATES = {
  STOCK: { rate: 0.01, min: 25, label: "Aktien" },
  ETF: { rate: 0.005, min: 25, label: "Investmentanteile über Börse" },
  OTHER: { rate: 0.01, min: 25, label: "Sonstige Wertpapiere" },
};

const SCHEDULE = {
  broker: "Eckernförder Bank",
  folder: "eckernforder",
  catalogueUrl: new URL("eckernforder-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/7557-plvpdf",
  readOn: "2026-10-26",
  entity: "Eckernförder Bank eG Volksbank-Raiffeisenbank",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "PLV Eckernförder Bank Stand 01.10.2026, 9.1.1 (Inland, Bank bzw. VR-ProfiBroker) relu le 2026-10-26",
  commission({ notionalEur, listing }) {
    const r = RATES[listing.type] || RATES.OTHER;
    return pctFee(notionalEur, r);
  },
  remark: "Custody 0.179% a year, min 6.40 € a line.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
