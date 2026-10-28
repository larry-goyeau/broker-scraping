// What one round trip costs at Kreissparkasse Ostalb: buy n shares on Xetra
// or the Frankfurt floor in an OstalbDepot, online, and sell them straight
// back, in dollars. Three depot models with different order prices, so three
// plans.
//
// Read 2026-10-26:
//   Preis- und Leistungsverzeichnis, 1. Mai 2026 (Fassung Feb. 2026), C.II.2
//   "Depot- und Transaktionsleistungen", page 38, "Transaktionspreise",
//   "Provision vom Kurswert je Abrechnung" "zzgl. Grundpreis je Abrechnung":
//     OstalbDepot          1,00 % + 14,90 €
//     OstalbDepot Trading  <5.000 € 1,00 %, <25.000 € 0,75 %, ≥25.000 €
//                          0,50 %, + 4,90 €
//     OstalbDepot Young RED (to the 24th birthday and students; 24 to 30)
//                          <5.000 € 0,50 %, <25.000 € 0,375 %, ≥25.000 €
//                          0,25 %, + 2,45 €
//   Page 37, "Fremdkosten in- und ausländischer Börsen und sonstiger
//   Handelsplätze": charged on top. Custody (page 38): OstalbDepot 24,90 € a
//   year + 0,185 % + 1,90 € a year per ISIN; Trading 29,90 € + 0,195 % +
//   1,90 € per ISIN (both max 890 €, the yearly Grundpreis waived with a
//   monthly fund savings plan of at least 50 €); Young free to 24, then
//   14,95 € + 0,0975 % + 0,95 € per ISIN:
//   https://www.ksk-ostalb.de/content/dam/myif/sk-ostalb/work/dokumente/pdf/preise-leistungen/preis-leistungsverzeichnis.pdf
//   Depot page: OstalbDepot Trading "Niedrige Transaktionspreise
//   (kanalunabhängig)", opened online ("OstalbDepot Trading eröffnen"); Young
//   RED "Grundpreis je Order nur 2,45 € zzgl. Provision (abhängig vom
//   Kurswert)":
//   https://www.ksk-ostalb.de/de/home/privatkunden/wertpapiere-und-boerse/wertpapier-depot.html
//   The prices are the same online and in a branch.
//
// Plans (one row each, `query.plan`), a side, the band read on the order's
// whole value:
//   trading     (default) Trading bands + 4.90 €
//   ostalbdepot 1.00 % + 14.90 €
//   young       Young RED bands + 2.45 € (to the 30th birthday)
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// from Deutsche Börse's list (group "sparkasse"; this catalogue has no
// Tradegate line). Same on the buy and the sell. The OstalbDepot Flat (1.29 %
// a year, min 300 €, up to 6 share orders a quarter included) is a custody
// price: not this trip. The models "ruhend ab 08.07.2024" are closed.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate the
// Sparkasse does not print: forced, unpublished FX, N/A. Taxes (French,
// Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: limits (0 €),
// the Umlagegebühr (only when the sale is in another depository), partial
// fills on different days.
//
//   node brokers/kreissparkasseos/kreissparkasseos_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/kreissparkasseos/kreissparkasseos_cost.mjs IE00B4L5Y983 XFRA EUR --shares=7 --price=123 --plan=young
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, euro, frPct, printCli } from "../1822direkt/germanyCost.mjs";

// Rate by order value: below 5,000 €, below 25,000 €, from 25,000 €.
function banded(label, rates, base) {
  return ({ notionalEur: v }) => {
    const rate = v < 5000 ? rates[0] : v < 25000 ? rates[1] : rates[2];
    const band = v < 5000 ? "< 5 000 €" : v < 25000 ? "< 25 000 €" : "≥ 25 000 €";
    const eur = rate * v + base;
    return { eur, note: `${label} : ${frPct(rate)} (${band}) + Grundpreis ${euro(base)} € → ${euro(eur)} €` };
  };
}

const SCHEDULE = {
  broker: "Kreissparkasse Ostalb",
  folder: "kreissparkasseos",
  catalogueUrl: new URL("kreissparkasseos-parsed.json", import.meta.url),
  url: "https://www.ksk-ostalb.de/content/dam/myif/sk-ostalb/work/dokumente/pdf/preise-leistungen/preis-leistungsverzeichnis.pdf",
  readOn: "2026-10-26",
  entity: "Kreissparkasse Ostalb (DE)",
  group: "sparkasse",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "trading",
  plans: {
    trading: {
      label: "OstalbDepot Trading",
      commission: banded("OstalbDepot Trading", [0.01, 0.0075, 0.005], 4.9),
      remark: "Custody 0.195% a year plus 1.90 € a holding and 29.90 € a year.",
      basis:
        "PLV Kreissparkasse Ostalb du 1er mai 2026, C.II.2 p. 38, relu le 2026-10-26 : OstalbDepot Trading " +
        "1,00 % / 0,75 % / 0,50 % du Kurswert selon la tranche + 4,90 € par décompte",
    },
    ostalbdepot: {
      label: "OstalbDepot",
      commission: banded("OstalbDepot", [0.01, 0.01, 0.01], 14.9),
      remark: "Custody 0.185% a year plus 1.90 € a holding and 24.90 € a year.",
      basis:
        "PLV Kreissparkasse Ostalb du 1er mai 2026, C.II.2 p. 38, relu le 2026-10-26 : OstalbDepot " +
        "1,00 % du Kurswert + 14,90 € par décompte",
    },
    young: {
      label: "OstalbDepot Young RED (up to 30)",
      commission: banded("OstalbDepot Young RED", [0.005, 0.00375, 0.0025], 2.45),
      remark: "",
      basis:
        "PLV Kreissparkasse Ostalb du 1er mai 2026, C.II.2 p. 38, relu le 2026-10-26 : OstalbDepot Young RED " +
        "(jusqu'à 30 ans) 0,50 % / 0,375 % / 0,25 % du Kurswert selon la tranche + 2,45 € par décompte",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
