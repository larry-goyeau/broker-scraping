// What one round trip costs at Kasseler Sparkasse: buy n shares on Xetra or
// the Frankfurt floor in the Sparkassen-Depot Klassik, online, and sell them
// straight back, in dollars.
//
// Read 2026-10-26:
//   Depot page, "Konditionen", "Provision je Wertpapierorder (Inland)":
//   Klassik "Provision bei Online-Order - für Börsengeschäfte in Aktien und
//   Investmentfonds ... 0,50 %, min. 26,50 Euro", footnote "zzgl.
//   Sparkassenspesen (2,00 Euro) sowie fremde Gebühren, Spesen und Courtage":
//   https://www.kasseler-sparkasse.de/de/home/privatkunden/wertpapiere-und-boerse/wertpapier-depot.html
//   Preisaushang Stand 15.10.2026, "Wertpapiere": Klassik "Aktien,
//   festverzinsliche Wertpapiere bei Auftragserteilung über Berater oder
//   Telefon/online 1,00 % / 0,50 % vom Kurswert mindestens 26,50 EUR zzgl.
//   Fremdkosten":
//   https://www.kasseler-sparkasse.de/content/dam/myif/kasseler-spk/work/dokumente/pdf/preise-leistungen/preisaushang.pdf
//   Kundeninformation zum Wertpapiergeschäft (Stand 01.09.2024, the price
//   table the Sparkasse links today), page 8, Klassik: "Aktien, Zertifikate,
//   Optionsscheine, Genussscheine in Stücknotierung 1,00 % vom Kurswert
//   (online 0,50% vom Kurswert), mindestens 26,50 EUR zzgl. 2,00 EUR";
//   "Exchange-Traded Fund (ETF) vom Kurswert 0,25 %, maximal 60,00 EUR zzgl.
//   10,00 EUR pro Transaktion" (no separate online price for ETFs); page 9
//   "Fremdkosten in- und ausländischer Börsen und sonstiger Handelsplätze":
//   https://www.kasseler-sparkasse.de/content/dam/myif/kasseler-spk/work/dokumente/pdf/allgemein/Kundeninformation_Wertpapiergeschaeft.pdf
//
// A side:
//   shares, ETCs, ETNs (notes in Stücknotierung): max(26.50, 0.50 % × value)
//     + 2.00 € Sparkassenspesen;
//   ETFs: min(60, 0.25 % × value) + 10.00 € (the ETF row of the
//     Kundeninformation; the depot page groups ETFs with "Investmentfonds"
//     at 0.50 %, min 26.50 €, the ETF row is the more specific one).
// The exchange's charges come on top, priced in ../1822direkt/germanyCost.mjs
// from Deutsche Börse's list (group "sparkasse": no Tradegate delivery fee;
// this catalogue has no Tradegate line). Same on the buy and the sell.
//
// Remark: custody in the Klassik depot, 0.20 % of the depot a year, at
// least 39.60 € (Preisaushang). The Sparkassen-Depot Flat (orders included
// in a 1.25 % a year depot fee, min 39.60 €) is a custody price, not an
// order price: not this trip.
//
// Cash is euro only (the settlement account is a Kasseler Sparkasse
// Girokonto). A non-euro Xetra line is converted at a rate the Sparkasse
// does not print: forced, unpublished FX, N/A. Taxes (French, Italian,
// Spanish FTT on the buy) from taxMap.mjs. Left out: limit orders (5.00 €
// "Vormerkung eines Limits"), adviser and phone orders (1.00 %), the
// Umlagegebühr (only when the sale is in another depository), partial fills
// on different days.
//
//   node brokers/kasselersparkass/kasselersparkass_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/kasselersparkass/kasselersparkass_cost.mjs IE00B4L5Y983 XFRA EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, euro, printCli } from "../1822direkt/germanyCost.mjs";

const SPESEN = 2.0;
const ETF_FLAT = 10.0;

function commission({ notionalEur, listing }) {
  if (listing?.type === "ETF") {
    const own = pctFee(notionalEur, { rate: 0.0025, max: 60, label: "ETF" });
    return { eur: own.eur + ETF_FLAT, note: `${own.note} + ${euro(ETF_FLAT)} € pro Transaktion` };
  }
  const own = pctFee(notionalEur, { rate: 0.005, min: 26.5, label: "Provision Online-Order (Klassik)" });
  return { eur: own.eur + SPESEN, note: `${own.note} + Sparkassenspesen ${euro(SPESEN)} €` };
}

const SCHEDULE = {
  broker: "Kasseler Sparkasse",
  folder: "kasselersparkass",
  catalogueUrl: new URL("kasselersparkass-parsed.json", import.meta.url),
  url: "https://www.kasseler-sparkasse.de/de/home/privatkunden/wertpapiere-und-boerse/wertpapier-depot.html",
  readOn: "2026-10-26",
  entity: "Kasseler Sparkasse (DE)",
  group: "sparkasse",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "barème Kasseler Sparkasse relu le 2026-10-26 (page Sparkassen-Depot, Preisaushang du 15.10.2026, " +
    "Kundeninformation zum Wertpapiergeschäft p. 8) : Klassik en ligne 0,50 %, min 26,50 € + 2,00 € de Spesen ; " +
    "ETF 0,25 %, max 60 € + 10 €",
  commission,
  remark: "Custody 0.20% a year, at least 39.60 €.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
