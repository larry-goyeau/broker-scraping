// What one round trip costs at Vereinigte VR Bank Kur- und Rheinpfalz eG (a
// Volksbank on the DZ BANK / Atruvia online brokerage): buy n shares on
// Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online ("Direct Brokerage"), in dollars. Two online order prices, so two
// plans:
//   "direkt"      Direkt, and every other depot model ordering online
//                 (Komfort, Komfort Plus Dynamik 25/50 and Start Plus pay
//                 the Direkt price "bei Transaktionen über das eBrokerage")
//   "direktplus"  Direkt Plus / Heavy Trader: same rate, capped at 39 €
//
// Read 2026-10-26:
//   https://www.vvrbank-krp.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Börsenorderentgelte": Direkt and Direkt Plus "Orderpauschale 4,90 €",
//   "zzgl. Orderentgelt Aktien 0,25 %", "Mindestentgelt pro Order 9,90 €",
//   "Maximalentgelt pro Order" "—" (Direkt) / "39,00 €" (Direkt Plus);
//   footnote 5: "Bei Transaktionen über das eBrokerage sind die
//   Börsenorderentgelte wie beim Modell Direkt"; "Nicht enthalten: fremde
//   Kosten, Gebühren anderer Börsen". Betreuungspauschale Direkt Plus
//   "39,00 €" a quarter, "Entfällt für das Folgequartal ab 9 Transaktionen
//   pro Quartal"; Direkt and Direkt Plus 0.045 % a quarter plus 1.00 € a
//   line, waived the next quarter with at least 1 trade (depot up to
//   100,000 €).
//   Preisverzeichnis Wertpapiere (Stand Oktober 2025), 9.1.1, "Direct
//   Brokerage", Inland: Aktien und aktienähnliche Wertpapiere, Sonstige
//   Wertpapiere "0,25 %" + "4,90 EUR", "mindestens 9,90 EUR", "maximal"
//   "39,00 EUR" for Direkt Plus/Heavy Trader only, the same in every model
//   column; "Zusätzlich wird die Bank die ihr bei der Auftragsausführung und
//   -abwicklung von Dritten berechneten Auslagen und fremden Kosten ... in
//   Rechnung stellen"; limit orders 0,00 EUR:
//   https://atruvia.scene7.com/is/content/atruvia/Preisverzeichnis%20Wertpapierepdf
//   Preisaushang Stand 01.10.2026: "Auftragserteilung über DirectBrokerage:
//   0,25% vom Kurswert zzgl. einer Pauschale von 4,90 EUR*, mind. 9,90EUR":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-191
//
// A side: 4.90 € + 0.25 % × value, at least 9.90 € (Direkt Plus: at most
// 39 €), for shares, ETFs, ETCs and ETNs alike. The venue's charges come on
// top, priced in ../1822direkt/germanyCost.mjs (group "dz": Xetra and
// Frankfurt Basic models, 0.10 € delivery fee a side on Tradegate). Same on
// the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate set "durch
// ein Verfahren ..., bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist", no margin printed: N/A. Taxes (French, Italian,
// Spanish FTT on the buy) from taxMap.mjs. Left out: adviser/phone orders
// (1.00 % surcharge), the 35 € foreign-exchange surcharge (another place),
// partial fills on different days.
//
//   node brokers/vereinigtevrkuru/vereinigtevrkuru_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vereinigtevrkuru/vereinigtevrkuru_cost.mjs DE0007164600 XETR EUR --shares=100 --price=215 --plan=direktplus
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const CUSTODY = "Custody 0.18% a year plus 4 € a line (waived with 1 trade a quarter).";

const SCHEDULE = {
  broker: "Vereinigte VR Bank Kur- und Rheinpfalz",
  folder: "vereinigtevrkuru",
  catalogueUrl: new URL("vereinigtevrkuru-parsed.json", import.meta.url),
  url: "https://www.vvrbank-krp.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Vereinigte VR Bank Kur- und Rheinpfalz eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "direkt",
  plans: {
    direkt: {
      label: "Direkt",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { base: 4.9, rate: 0.0025, min: 9.9, label: "Direct Brokerage, Direkt" }),
      remark: CUSTODY,
      basis:
        "page Wertpapierdepot et Preisverzeichnis Wertpapiere 9.1.1 (Direct Brokerage, Inland) Vereinigte VR Bank Kur- und Rheinpfalz relus le 2026-10-26 : 4,90 € + 0,25 %, min 9,90 €, sans plafond",
    },
    direktplus: {
      label: "Direkt Plus",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { base: 4.9, rate: 0.0025, min: 9.9, max: 39, label: "Direct Brokerage, Direkt Plus" }),
      remark: "Custody 156 € a year (waived with 9 trades a quarter), plus 0.18% a year and 4 € a line (waived with 1 trade a quarter).",
      basis:
        "page Wertpapierdepot et Preisverzeichnis Wertpapiere 9.1.1 (Direct Brokerage, Inland) Vereinigte VR Bank Kur- und Rheinpfalz relus le 2026-10-26 : 4,90 € + 0,25 %, min 9,90 €, max 39 € (Direkt Plus / Heavy Trader)",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
