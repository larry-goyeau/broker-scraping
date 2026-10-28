// What one round trip costs at Emsländische Volksbank eG (Lingen; DZ BANK /
// Atruvia online brokerage): buy n shares on Xetra, the Frankfurt floor or
// Tradegate and sell them straight back, online, in dollars.
//
// Read 2026-10-26:
//   Preisaushang Stand 01.10.2026 (linked as "Preisaushang" in the site
//   footer, https://www.elvb.de/preisaushang.html), page 2, "Wertpapiere",
//   "Ausführung im Inland", "Online-Brokerage Provision: [ ] % vom
//   Kurswert/Minimum Maximum", Aktien "0,25 % / 10,00 EUR Max. 59,25 EUR"
//   (branch column "1,00 % / 30,00 EUR"); "Limitvormerkung, -änderung und
//   -streichung 2,00 EUR pro Auftrag" with footnote 3 "Wird nur berechnet,
//   wenn der Auftrag nicht ausgeführt wird"; "Entgelt für die Verwahrung von
//   Wertpapieren (inkl. USt) pro Quartal 0,50 ‰", "Mindestpreis pro Depot
//   (inkl. USt.) (Ausnahme: mein Depot) pro Quartal 5,00 EUR":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushang%2001.10.2026pdf-1
//   meinDepot "für alle unter 31 Jahren", "Kostenlose Depotführung",
//   "Trades ab 3,95 Euro" (no fuller meinDepot order price is printed):
//   https://www.elvb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// A side: max(10.00, min(59.25, 0.25 % × value)). Shares, ETFs, ETCs and
// ETNs take the Aktien row (exchange orders). The limit fee is billed only
// on an order that is not executed: not part of a round trip. The venue's
// charges come on top, priced in ../1822direkt/germanyCost.mjs (Xetra Basic;
// Frankfurt Transaktions- and Handelsentgelt; group "dz": 0.10 € delivery
// fee a side on Tradegate). Same on the buy and the sell.
//
// Remarks: custody 0.20 % a year (0.50 ‰ a quarter, at least 5 € a
// quarter); meinDepot (under 31) trades from 3.95 € an order, so "Fees might
// be x% lower if you are under 31.", x = the cut of the standard order
// price when 3.95 € a side takes its place. Only the "ab" figure is
// printed, so meinDepot is not a row of its own.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate with no margin printed for securities: forced, unpublished FX, N/A.
// Taxes (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// branch orders, foreign exchanges (online 0,25 % / 50,00 EUR), partial
// fills on different days.
//
//   node brokers/emslandischevolk/emslandischevolk_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/emslandischevolk/emslandischevolk_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const ORDER = { rate: 0.0025, min: 10, max: 59.25 };
const MEIN_DEPOT_FROM = 3.95;
const CUSTODY = "Custody 0.20% a year (min 5 € a quarter).";

function remark({ notionalEur }) {
  const own = pctFee(notionalEur, ORDER).eur;
  if (!(own > MEIN_DEPOT_FROM)) return CUSTODY;
  const pct = Math.round((100 * (own - MEIN_DEPOT_FROM)) / own);
  return pct > 0 ? `${CUSTODY} Fees might be ${pct}% lower if you are under 31.` : CUSTODY;
}

const SCHEDULE = {
  broker: "Emsländische Volksbank",
  folder: "emslandischevolk",
  catalogueUrl: new URL("emslandischevolk-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/Preisaushang%2001.10.2026pdf-1",
  readOn: "2026-10-26",
  entity: "Emsländische Volksbank eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang Emsländische Volksbank du 01.10.2026 relu le 2026-10-26 : Online-Brokerage, exécution en Allemagne, " +
    "Aktien 0,25 % du Kurswert, min 10,00 €, max 59,25 €, plus les frais de la place",
  commission: ({ notionalEur }) => pctFee(notionalEur, { ...ORDER, label: "Online-Brokerage Inland, Aktien" }),
  remark,
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
