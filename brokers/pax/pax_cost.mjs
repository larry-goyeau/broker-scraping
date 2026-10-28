// What one round trip costs at Pax-Bank für Kirche und Caritas eG (Pax-BKC,
// Paderborn): buy n shares on Xetra or the Frankfurt floor through the
// bank's Online-Brokerage (the DZ BANK brokerage of the cooperative banks,
// OnlineBanking and VR Banking App) and sell them straight back, in dollars.
//
// https://www.pax-bkc.de/privatkunden/konditionsuebersicht.html read on
// 2026-10-26, "Wertpapiere & Depot", shares, ETFs and other securities,
// column "Online-Brokerage Provision vom Kurswert": "bis 10,00 € 0,00 %",
// "bis 49.999,99 € 0,25 %", "ab 50.000,00 € 0,25 %"; "Die Mindestprovision
// bei Ordererteilung über Online-Brokerage 10,00 €"; "Die Mindestprovision
// entfällt bei einem Kurswert bis 10,00 EUR."
// The same figures in the price list, Stand 01.10.2026, 9.1.1:
// https://atruvia.scene7.com/is/content/atruvia/20261001_Pax-BKC_PLV-Gesamtpdf
// "Zusätzlich wird die Bank die ihr bei der Auftragsausführung und
// -abwicklung von Dritten berechneten Auslagen und fremden Kosten in
// Rechnung stellen." No cap is printed.
//
// Plans (one row each, `query.plan`):
//   standard   the ordinary depot: 0,25 % of the Kurswert, at least 10 €
//              (nothing up to 10 € of Kurswert), a side.
//   meindepot  "meinDepot - junge Kunden (für Kinder und junge Erwachsene
//              bis zur Vollendung des 31. Lebensjahres)", Ausführung im
//              Inland, Online-Brokerage: "alle 4,95" EUR a side, "alle (als
//              Best Execution ausgeführt) 3,95". A catalogue row is an order
//              on its own venue ("gemäß Weisung"), so 4,95 € is priced and
//              the 1 € Best Execution saving is a remark.
//   The closed "meinDepot (kein Neuabschluss möglich)" and the flat-fee
//   "Pax-BKC ComfortDepot" (0,95 % p.a. of the depot, custody) are not this
//   trip.
//
// On top, per side, from ../1822direkt/germanyCost.mjs: Xetra
// Transaktionsentgelt (Basic, 0,72 bp, min 0,90 €), Frankfurt
// Transaktionsentgelt (1,44 bp, min 0,90 €) + Handelsentgelt (5,04 bp, min
// 2,52 €), the book, the FR/IT/ES FTT on the buy (taxMap).
//
// FX: the account is in euro only. A USD/GBP/CHF/SEK/JPY/AUD Xetra line is
// settled by converting at DZ BANK's GenoFX rate ("Marktgerechtigkeit des
// Wechselkurses"), with no margin printed for securities: forced and
// unpublished, so that total is N/A.
//
// Custody (PLV 9.2.1): "Depot mit Fremdtiteln pro Fremdtitel je
// Kalendervierteljahr 1,25 EUR mindestens 5,00 EUR" (meinDepot: 0,00 EUR);
// a remark on the standard plan.
//
// Left out: limit fees (0 € online), partial fills on other days (billed as
// separate orders), capital gains tax.
//
//   node brokers/pax/pax_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/pax/pax_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side

function standard({ notionalEur }) {
  if (notionalEur <= 10) {
    return { eur: 0, note: "Kurswert jusqu'à 10 € : 0,00 %, pas de minimum → 0,00 €" };
  }
  return pctFee(notionalEur, { rate: 0.0025, min: 10, label: "Online-Brokerage" });
}

function meinDepotRemark() {
  const pct = Math.round((100 * BEST_EXECUTION_SAVING) / 4.95);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "Pax-Bank",
  folder: "pax",
  catalogueUrl: new URL("pax-parsed.json", import.meta.url),
  url: "https://www.pax-bkc.de/privatkunden/konditionsuebersicht.html",
  readOn: "2026-10-26",
  entity: "Pax-Bank für Kirche und Caritas eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "standard",
  plans: {
    standard: {
      label: "Online-Brokerage",
      commission: standard,
      remark: "Custody is 1.25 € a quarter per holding, at least 5 € a quarter.",
      basis:
        "conditions Pax-Bank relues le 2026-10-26 (Konditionsübersicht et PLV Stand 01.10.2026, 9.1.1) : " +
        "Online-Brokerage 0,25 % du Kurswert, min 10 €, rien jusqu'à 10 €",
    },
    meindepot: {
      label: "meinDepot (under 31)",
      commission: () => ({ eur: 4.95, note: "meinDepot, Ausführung im Inland, Online-Brokerage : 4,95 € l'ordre" }),
      remark: meinDepotRemark,
      basis:
        "PLV Pax-Bank Stand 01.10.2026, 9.1.1, meinDepot - junge Kunden (jusqu'à 31 ans) : 4,95 € l'ordre " +
        "sur une place allemande désignée, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
