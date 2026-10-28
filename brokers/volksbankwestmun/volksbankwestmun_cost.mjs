// What one round trip costs at Volksbank Westmünsterland eG (Borken, DZ BANK
// / Atruvia online brokerage, OnlineBanking and VR Banking App): buy n shares
// on Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars. Three depot models price an order differently, so three
// plans:
//   "direkt"   Direkt   9,90 € + 0,39 % a side
//   "komfort"  Komfort  9,90 € + 0,79 % a side
//   "premium"  Premium  4,90 € + 0,49 % a side
//
// Read 2026-10-26:
//   https://www.volksbank-wml.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Depotmodelle, Konditionen und Gebühren", columns Direkt / Komfort /
//   Premium / meinDepot: "Kauf und Verkauf von Wertpapieren,
//   Servicegebühren je Transaktion 9,90 € 9,90 € 4,90 € 0,00 €";
//   "Transaktionspreis vom Kurswert: - Aktien - Verzinsliche Wertpapiere -
//   Options- und Genussscheine/Genussrechte 0,39% 0,79 % 0,49% 0,00 € zzgl.
//   fremde Kosten"; "Kauf und Verkauf von Fonds (an der Börse) 0,39% 0,79%
//   0,49 %"; "Grundpreis p.M. 2,26 € 5,83 € 15,35 € 0,00 €",
//   "Depotverwaltung je Wertpapierposten p.M. 1,79 € 1,79 € 1,79 € 0,00 €";
//   "Brutto-Preise inkl. der gesetzlichen Mehrwertsteuer"; "Für
//   Kommissionsgeschäfte im Ausland werden zusätzlich 15,00 EUR berechnet".
//   No floor and no cap printed.
//   https://www.volksbank-wml.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   meinDepot ("für alle unter 31 Jahren", "max. 100.000 € Depotvolumen"):
//   the table prints "0,00 € zzgl. fremde Kosten", the same page says
//   "Trades ab 3,95 Euro". The two do not agree and no fuller meinDepot
//   order price is printed, so meinDepot is not a row of its own: a remark
//   "Fees might be x% lower if you are under 31.", computed at the order's
//   value with 3.95 € a side in place of the plan's price (as in
//   ../dkmdarlehnskasse/dkmdarlehnskasse_cost.mjs).
//
// A side: Servicegebühr + Transaktionspreis × Kurswert, the same for shares,
// ETFs (Fonds an der Börse), ETCs and ETNs (notes). The venue's charges come
// on top ("zzgl. fremde Kosten"), priced in ../1822direkt/germanyCost.mjs
// (Xetra Basic; Frankfurt Transaktions- and Handelsentgelt; group "dz":
// 0.10 € delivery fee a side on Tradegate). Same on the buy and the sell.
// Custody (Grundpreis a month and 1.79 € a line a month) is a remark.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate (DZ BANK GenoFX), with no margin printed for securities: forced,
// unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: phone orders, foreign exchanges, savings plans,
// partial fills on different days.
//
//   node brokers/volksbankwestmun/volksbankwestmun_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankwestmun/volksbankwestmun_cost.mjs DE0007164600 XFRA EUR --shares=4 --price=215 --plan=premium
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, euro, frPct, printCli } from "../1822direkt/germanyCost.mjs";

const MEIN_DEPOT_FROM = 3.95;
const LINE_A_YEAR = 1.79 * 12;

const PRICES = {
  direkt: { label: "Direkt", base: 9.9, rate: 0.0039, month: 2.26 },
  komfort: { label: "Komfort", base: 9.9, rate: 0.0079, month: 5.83 },
  premium: { label: "Premium", base: 4.9, rate: 0.0049, month: 15.35 },
};

function remarkOf(p) {
  const custody = `Custody ${(p.month * 12).toFixed(2)} € a year plus ${LINE_A_YEAR.toFixed(2)} € a line.`;
  return ({ notionalEur, venue, listing }) => {
    const own = pctFee(notionalEur, p).eur;
    if (!(own > MEIN_DEPOT_FROM)) return custody;
    const pct = Math.round((100 * (own - MEIN_DEPOT_FROM)) / own);
    return pct > 0 ? `${custody} Fees might be ${pct}% lower if you are under 31.` : custody;
  };
}

const plans = Object.fromEntries(
  Object.entries(PRICES).map(([id, p]) => [
    id,
    {
      label: p.label,
      commission: ({ notionalEur }) => pctFee(notionalEur, { base: p.base, rate: p.rate, label: `${p.label}, Servicegebühr + Transaktionspreis` }),
      remark: remarkOf(p),
      basis:
        `page Wertpapierdepot de la Volksbank Westmünsterland relue le 2026-10-26, modèle ${p.label} : ` +
        `${euro(p.base)} € de Servicegebühr + ${frPct(p.rate)} du Kurswert par ordre, sans minimum ni plafond, plus les frais de la place`,
    },
  ]),
);

const SCHEDULE = {
  broker: "Volksbank Westmünsterland",
  folder: "volksbankwestmun",
  catalogueUrl: new URL("volksbankwestmun-parsed.json", import.meta.url),
  url: "https://www.volksbank-wml.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Westmünsterland eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  plans,
  defaultPlan: "direkt",
};

export const PLANS = Object.fromEntries(Object.entries(plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
