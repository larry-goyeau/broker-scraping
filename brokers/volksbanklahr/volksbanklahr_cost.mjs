// What one round trip costs at Volksbank Lahr eG (a Volksbank on the DZ
// BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online
// ("Brokerage/Mobile"), in dollars.
//
// Read 2026-10-26, depot page, "Depotmodelle, Konditionen und Gebühren":
//   https://www.volksbank-lahr.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Transaktionen", "Aktien und aktienähnliche Werte" and "Verzinsliche
//   Wertpapiere ...; Investmentanteile über Börse", column Brokerage/Mobile:
//   "0,25% Provision vom Kurswert, mind. 12,50 Euro, max. 59,90 Euro +
//   Fremde Gebühren" (column Persönliche Beratung "1% Provision vom
//   Kurswert, mind. 25,00 Euro").
//   Custody: "1,79‰ vom Kurswert inkl. Ust/Jahr", "Mindestentgelt 11,90 Euro
//   pro Depot", "5,96 Euro pro Posten"; "Bei mind. 3 provisionsbasierten
//   Online-Umsätzen im laufenden Quartal entfällt für Sie das Depotentgelt
//   für das laufende Quartal"; "Junge-Leute-Depot kostenfrei" (custody only,
//   same order price).
//
// A side: 0.25 % × value, at least 12.50 €, at most 59.90 €, for shares,
// ETFs, ETCs and ETNs alike. The "Fremde Gebühren" are the venue's charges,
// priced in ../1822direkt/germanyCost.mjs (group "dz": Xetra and Frankfurt
// Basic models, 0.10 € delivery fee a side on Tradegate). Same on the buy
// and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// adviser orders, DZ BANK products (min 4.95 €), foreign exchanges, partial
// fills on different days.
//
//   node brokers/volksbanklahr/volksbanklahr_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "Volksbank Lahr",
  folder: "volksbanklahr",
  catalogueUrl: new URL("volksbanklahr-parsed.json", import.meta.url),
  url: "https://www.volksbank-lahr.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Lahr eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "page Wertpapierdepot Volksbank Lahr relue le 2026-10-26, Brokerage/Mobile : 0,25 % du Kurswert, min 12,50 €, max 59,90 € + fremde Gebühren",
  commission: ({ notionalEur }) =>
    pctFee(notionalEur, { rate: 0.0025, min: 12.5, max: 59.9, label: "Brokerage/Mobile" }),
  remark: "Custody 0.179% a year, min 11.90 € a depot and 5.96 € a line, free with 3 online trades a quarter.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
