// What one round trip costs at Bank 1 Saar eG (Volksbank im Saarland, DZ
// BANK / Atruvia online brokerage in OnlineBanking and the VR Banking App):
// buy n shares on Xetra and sell them straight back, online, in dollars.
// Three depot models with their own order prices, so three plans:
//   "aktiv"        Depot Aktiv, the online depot
//   "service"      Depot Service, the advised model (orders can be placed
//                  online too)
//   "serviceplus"  Depot Service Plus
//
// Read 2026-10-26, Depot Aktiv page and Depot-Vergleich (both "Stand:
// 01.10.2026"), "Börsenorderentgelt pro Order Aktien":
//   Depot Aktiv "bis 10.000,00 EUR Ordergegenwert 12,95 EUR", "10.000,01 EUR
//   bis 30.000,00 EUR Ordergegenwert 24,95 EUR", "ab 30.000,01 EUR
//   Ordergegenwert 49,95 EUR", "Mindestentgelt pro Order 12,95 EUR";
//   "Aufschlag bei beratener oder bedienter Orderausführung 1,00% vom
//   Ordergegenwert" (branch/phone, not this trip).
//   Depot Service "1,00% zzgl. 9,95 EUR" / "0,75% zzgl. 9,95 EUR" / "0,50%
//   zzgl. 9,95 EUR" on the same bands, "Mindestentgelt pro Order 24,95 EUR".
//   Depot Service Plus "0,80% zzgl. 4,95 EUR" / "0,60% zzgl. 4,95 EUR" /
//   "0,40% zzgl. 4,95 EUR", "Mindestentgelt pro Order 24,95 EUR".
//   Custody a quarter: Depot Aktiv "ab 0,00 EUR" when "Im Quartal mindestens
//   25.000 EUR Online-Ordervolumen oder im Quartal mindestens 3
//   Online-Transaktionen, die über eine Börse ausgeführt werden, ansonsten
//   Abrechnung der Depotentgelte wie beim Modell Depot Service"; Depot
//   Service "Grundpreis 4,95 EUR", "Postenpauschale 0,95 EUR", "Depotentgelt
//   0,05%"; Depot Service Plus 49,95 EUR, 0,45 EUR, 0,03%.
//   https://www.bank1saar.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depot-aktiv.html
//   https://www.bank1saar.de/privatkunden/geldanlage-und-sparen/depot-vergleich.html
// The table names shares (and bonds) only; exchange-traded funds, ETCs and
// ETNs bought on an exchange are priced like shares here.
//
// A side: the band price of the whole order value (Aktiv: 12,95 / 24,95 /
// 49,95 €; Service: 9,95 € + 1,00 / 0,75 / 0,50 %; Service Plus: 4,95 € +
// 0,80 / 0,60 / 0,40 %; both at least 24,95 €). The venue's charges come on
// top, priced in ../1822direkt/germanyCost.mjs (group "dz"). Same on the buy
// and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed: N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: the foreign-exchange surcharge ("Auslandsaufschlag",
// another place), savings plans (off exchange), DZ BANK own issues, partial
// fills on different days.
//
//   node brokers/bank1saar/bank1saar_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/bank1saar/bank1saar_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=service
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, bandFee, printCli } from "../1822direkt/germanyCost.mjs";

const AKTIV = [
  { upTo: 10000, base: 12.95 },
  { upTo: 30000, base: 24.95 },
  { upTo: Infinity, base: 49.95 },
];
const SERVICE = [
  { upTo: 10000, base: 9.95, rate: 0.01, min: 24.95 },
  { upTo: 30000, base: 9.95, rate: 0.0075, min: 24.95 },
  { upTo: Infinity, base: 9.95, rate: 0.005, min: 24.95 },
];
const SERVICE_PLUS = [
  { upTo: 10000, base: 4.95, rate: 0.008, min: 24.95 },
  { upTo: 30000, base: 4.95, rate: 0.006, min: 24.95 },
  { upTo: Infinity, base: 4.95, rate: 0.004, min: 24.95 },
];

const SERVICE_CUSTODY = "Custody 0.20% a year plus 19.80 € a year and 3.80 € a line.";
const READ = "Depot-Vergleich Bank 1 Saar Stand 01.10.2026 relu le 2026-10-26";

const SCHEDULE = {
  broker: "Bank 1 Saar",
  folder: "bank1saar",
  catalogueUrl: new URL("bank1saar-parsed.json", import.meta.url),
  url: "https://www.bank1saar.de/privatkunden/geldanlage-und-sparen/depot-vergleich.html",
  readOn: "2026-10-26",
  entity: "Bank 1 Saar eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "aktiv",
  plans: {
    aktiv: {
      label: "Depot Aktiv",
      commission: ({ notionalEur }) => bandFee(notionalEur, AKTIV, "Depot Aktiv, Börsenorderentgelt Aktien"),
      remark: "Custody 0.20% a year plus 19.80 € a year and 3.80 € a line, waived with 3 online trades a quarter.",
      basis: `${READ}, Depot Aktiv : 12,95 € jusqu'à 10 000 € de Ordergegenwert, 24,95 € jusqu'à 30 000 €, 49,95 € au-delà`,
    },
    service: {
      label: "Depot Service",
      commission: ({ notionalEur }) => bandFee(notionalEur, SERVICE, "Depot Service, Börsenorderentgelt Aktien"),
      remark: SERVICE_CUSTODY,
      basis: `${READ}, Depot Service : 9,95 € + 1,00 % / 0,75 % / 0,50 % (tranches 10 000 € / 30 000 €), min 24,95 €`,
    },
    serviceplus: {
      label: "Depot Service Plus",
      commission: ({ notionalEur }) => bandFee(notionalEur, SERVICE_PLUS, "Depot Service Plus, Börsenorderentgelt Aktien"),
      remark: "Custody 0.12% a year plus 199.80 € a year and 1.80 € a line.",
      basis: `${READ}, Depot Service Plus : 4,95 € + 0,80 % / 0,60 % / 0,40 % (tranches 10 000 € / 30 000 €), min 24,95 €`,
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
