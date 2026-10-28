// What one round trip costs at Volksbank eG – Die Gestalterbank (a Volksbank
// on the DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the
// Frankfurt floor or Tradegate and sell them straight back, online, in
// dollars. Two online order prices, so two plans:
//   "online"    Online Depot and meinDepot Classic (the same online price)
//   "meindepot" meinDepot, "Depotinh. unter 31 Jahre" (moved to meinDepot
//               Classic in the calendar year after the 31st birthday)
//
// Read 2026-10-26:
//   https://www.gestalterbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   ("Stand: Juli 2026"), row "Ordererfassung per Online-Brokerage", Aktien,
//   Investmentanteile, Zertifikate...: meinDepot Classic and Online Depot
//   "0,25 % vom Kurswert mind. 9,90 € max. 59,90 €" (footnote 8 "Ausländische
//   Börsen mind. 35,90 €"); meinDepot "3,95 € inländische Best-Execution
//   Orders", "4,90 € alle inländischen Börsen", "sonst 0,25 % vom Kurswert
//   mind. 9,90 € max. 59,90 €" (foreign exchanges). Custody: meinDepot
//   Classic "0,18 % p. a." (at least 10 € a quarter); Online Depot free with
//   "Zwei Trades pro Quartal, ansonsten 5,70 € pro Quartal"; meinDepot free.
//   Preisaushang Stand 15.08.2026, p. 2, "Ordererfassung per Online-Brokerage
//   (Provision)": "0,25 % vom Kurswert mind. 9,90 € / max. 59,90 €"; "Porti
//   und sonstige Auslagen sind in den obigen Sätzen nicht enthalten":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushang-Volksbank-eG1pdf
//
// A catalogue row is an order on its own venue ("gemäß Weisung"), so the
// meinDepot plan pays the 4.90 € "alle inländischen Börsen" price; the
// 3.95 € Best Execution price (DZ BANK then picks Quotrix, Tradegate, Xetra,
// Frankfurt or Stuttgart) is the remark "Fees might be x% lower ...", x =
// the cut of the 4.90 € order price itself (19).
//
// A side: online max(9.90, min(59.90, 0.25 % × value)); meinDepot 4.90 €.
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy and
// the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: bank
// or call-centre orders (0.8 % + 19.90 €), the flat-fee meinDepot Premium
// (1.20 % p.a. of the depot with 25 orders included: custody, not a trade
// price), partial fills on different days.
//
//   node brokers/volksbankegdiege/volksbankegdiege_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//   node brokers/volksbankegdiege/volksbankegdiege_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const BEST_EXECUTION = 3.95;
const MEINDEPOT = 4.9;

function bestExecutionRemark({ notionalEur }) {
  if (!(notionalEur > 0)) return "";
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower if sent as a Best Execution order.`;
}

export const PLANS = {
  online: {
    label: "Online Depot / meinDepot Classic",
    commission: ({ notionalEur }) =>
      pctFee(notionalEur, { rate: 0.0025, min: 9.9, max: 59.9, label: "Online-Brokerage" }),
    remark: "Custody 5.70 € a quarter unless 2 trades a quarter.",
    basis:
      "barème Gestalterbank relu le 2026-10-26 (page Wertpapierdepot, Stand Juli 2026, et Preisaushang du 15.08.2026) : " +
      "Online-Brokerage 0,25 % du Kurswert, min 9,90 €, max 59,90 €",
  },
  meindepot: {
    label: "meinDepot (under 31)",
    commission: () => ({ eur: MEINDEPOT, note: "meinDepot, alle inländischen Börsen : 4,90 € l'ordre" }),
    remark: bestExecutionRemark,
    basis:
      "barème Gestalterbank relu le 2026-10-26 (page Wertpapierdepot, Stand Juli 2026) : meinDepot (moins de 31 ans) " +
      "4,90 € l'ordre sur une place allemande désignée, 3,95 € en Best Execution",
  },
};

const SCHEDULE = {
  broker: "Volksbank eG – Die Gestalterbank",
  folder: "volksbankegdiege",
  catalogueUrl: new URL("volksbankegdiege-parsed.json", import.meta.url),
  url: "https://www.gestalterbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank eG – Die Gestalterbank",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  plans: PLANS,
  defaultPlan: "online",
};

export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
