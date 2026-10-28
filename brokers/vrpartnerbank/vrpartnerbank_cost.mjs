// What one round trip costs at VR PartnerBank eG Chattengau-Schwalm-Eder (a
// Volksbank on the DZ BANK / Atruvia online brokerage): buy n shares on
// Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars. Two order prices, so two plans:
//   "trading"   VR PartnerTrading (the depot opened online; VR PartnerAnlage
//               has the same online order price and is opened by appointment)
//   "meindepot" meinDepot, for clients aged 18 to 30 (moved to VR
//               PartnerTrading terms at 31)
//
// Read 2026-10-26:
//   https://www.vr-partnerbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Order online": meinDepot (18-30) "2,00 €"; VR PartnerTrading and VR
//   PartnerAnlage "0,25 % vom Kurswert (ab 5.000 €, darunter 12,50 €)".
//   Preisaushang gültig ab 1. Okt. 2026, page 4, "Ausführung im Inland,
//   Online-Brokerage": meinDepot "2,00 EUR pro Stück" (the column is headed
//   "% vom Kurswert/Minimum, EUR pro Stück/Minimum"; the depot page says
//   2.00 € an online order, which is used here), VR PartnerTrading / VR
//   Partner Anlage "0,25 %, mind. 12,50 EUR"; across all columns "unter 10
//   EUR Kurswert frei" and "Kauf und Verkaufsaufträge bis zu einem Kurswert
//   von 100 EUR: 10 EUR pro Auftrag"; "Limitgebühren, pro Abrechnung 5,00
//   EUR"; "Zusätzlich wird die Bank die ihr bei der Auftragsausführung und
//   -abwicklung von Dritten berechneten Auslagen und fremden Kosten in
//   Rechnung stellen":
//   https://atruvia.scene7.com/is/content/atruvia/0070_Preisaushangpdf
//   Custody: VR PartnerTrading 4.00 € a quarter plus 0.06 % of the depot a
//   quarter, both waived in a quarter with more than six online
//   transactions; meinDepot free.
//
// A side: trading max(12.50, 0.25 % × value); meinDepot 2.00 €; a value
// under 10 € is free and up to 100 € pays 10 €. The venue's charges come on
// top, priced in ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery
// fee a side on Tradegate). Same on the buy and the sell. A market order:
// the 5 € limit fee is a remark.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate "durch ein
// Verfahren ermittelt, bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist" (Preisaushang), no margin printed: N/A. Taxes (French,
// Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: adviser orders
// (1.00 %, min 40 €), partial fills on different days.
//
//   node brokers/vrpartnerbank/vrpartnerbank_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//   node brokers/vrpartnerbank/vrpartnerbank_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, euro, printCli } from "../1822direkt/germanyCost.mjs";

const SMALL = { free: 10, upTo: 100, eur: 10 };
const LIMIT = "Limit orders cost 5 € more.";

function small(v) {
  if (v < SMALL.free) return { eur: 0, note: `ordre de moins de ${euro(SMALL.free)} € : gratuit` };
  if (v <= SMALL.upTo) return { eur: SMALL.eur, note: `ordre jusqu'à ${euro(SMALL.upTo)} € : ${euro(SMALL.eur)} €` };
  return null;
}

export const PLANS = {
  trading: {
    label: "VR PartnerTrading",
    commission: ({ notionalEur }) =>
      small(notionalEur) || pctFee(notionalEur, { rate: 0.0025, min: 12.5, label: "Order online VR PartnerTrading" }),
    remark: `Custody 0.24% a year plus 16 € (waived with more than 6 online trades a quarter). ${LIMIT}`,
  },
  meindepot: {
    label: "meinDepot (18-30)",
    commission: ({ notionalEur }) =>
      small(notionalEur) || { eur: 2, note: "Order online meinDepot : 2,00 €" },
    remark: LIMIT,
  },
};

const SCHEDULE = {
  broker: "VR PartnerBank",
  folder: "vrpartnerbank",
  catalogueUrl: new URL("vrpartnerbank-parsed.json", import.meta.url),
  url: "https://www.vr-partnerbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR PartnerBank eG Chattengau-Schwalm-Eder",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "barème VR PartnerBank (page Wertpapierdepot et Preisaushang du 1er octobre 2026) relu le 2026-10-26",
  plans: PLANS,
  defaultPlan: "trading",
};

export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
