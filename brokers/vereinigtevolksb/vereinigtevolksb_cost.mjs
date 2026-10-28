// What one round trip costs at Vereinigte Volksbanken eG (diebank.de, a
// Volksbank on the DZ BANK / Atruvia online brokerage): buy n shares on
// Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online ("Online-Brokerage"), in dollars. Two online order prices, so two
// plans:
//   "standard"   the Wertpapierdepot
//   "meindepot"  meinDepot, for clients under 31
//
// Read 2026-10-26:
//   Preisaushang Stand 17.10.2026, "Transaktionspreise", column "über
//   Online-Brokerage", "Börslich", "Aktien, Investmentanteile + sonstige
//   Wertpapiere": "unter 50 TEUR: 0,15% vom Kurswert", "ab 50 TEUR: 0,113%
//   vom Kurswert"; "Mindestkosten je Transaktion", "Inländische Börsen"
//   "14,95 EUR" (the adviser/phone column: 1,00 % / 0,75 %, min 29,95 EUR).
//   Custody "0,0375 %" a quarter under 500,000 €, "Grundpreis zusätzlich pro
//   Quartal Mitglied/Nichtmitglied 5,00 EUR/6,00 EUR"; "Depotkunden bis 30
//   Jahre im Depotmodell „meinDepot“ -,-- EUR"; online limit orders "-,--
//   EUR":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushang_17.10.2026pdf
//   The depot page: "Börslich (Online-Brokerage) Ab 14,95 Euro je
//   Transaktion (inländische Börsen)":
//   https://www.diebank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   meinDepot ("Günstig handeln – für alle unter 31 Jahren"): "Fixer
//   Orderpreis ... an allen inländischen Börsenplätzen. 4,95 Euro", "3,95
//   Euro (bei Ausführung als Best Execution)":
//   https://www.diebank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// A side: standard 0.15 % × value under 50,000 €, 0.113 % × value from
// 50,000 €, at least 14.95 €, no cap; meinDepot 4.95 €. A catalogue row is an
// order on its own venue, so the 3.95 € Best Execution price is a remark
// ("Fees might be x% lower."). The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz": Xetra and Frankfurt Basic
// models, 0.10 € delivery fee a side on Tradegate). Same on the buy and the
// sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank at its
// own rate with no margin printed: N/A. Taxes (French, Italian, Spanish FTT
// on the buy) from taxMap.mjs. Left out: adviser/phone orders, the 5 € phone
// surcharge, foreign exchanges (min 29.95 €), partial fills on different
// days.
//
//   node brokers/vereinigtevolksb/vereinigtevolksb_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vereinigtevolksb/vereinigtevolksb_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, bandFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;
const ONLINE = [
  { upTo: 49_999.99, rate: 0.0015, min: 14.95 },
  { upTo: Infinity, rate: 0.00113, min: 14.95 },
];

function bestExecutionRemark() {
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "Vereinigte Volksbanken",
  folder: "vereinigtevolksb",
  catalogueUrl: new URL("vereinigtevolksb-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/Preisaushang_17.10.2026pdf",
  readOn: "2026-10-26",
  entity: "Vereinigte Volksbanken eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "standard",
  plans: {
    standard: {
      label: "Wertpapierdepot",
      commission: ({ notionalEur }) => bandFee(notionalEur, ONLINE, "Online-Brokerage, börslich, Inland"),
      remark: "Custody 0.15% a year plus 24 € (20 € for members).",
      basis:
        "Preisaushang Vereinigte Volksbanken Stand 17.10.2026 relu le 2026-10-26 : Online-Brokerage 0,15 % (0,113 % dès 50 000 €), min 14,95 € sur les places allemandes",
    },
    meindepot: {
      label: "meinDepot (under 31)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Fixer Orderpreis alle inländischen Börsenplätze : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "page meinDepot Vereinigte Volksbanken relue le 2026-10-26 : 4,95 € l'ordre sur toute place allemande, 3,95 € en Best Execution (moins de 31 ans)",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
