// What one round trip costs at Bank für Kirche und Diakonie eG (KD-Bank,
// DZ BANK / Atruvia online brokerage): buy n shares on Xetra or the
// Frankfurt floor and sell them straight back, online, in dollars.
//
// Read 2026-10-26:
//   Preis- und Leistungsverzeichnis, Stand 01.04.2026, 9.1.1 "Kauf und
//   Verkauf (Provision)", Orderpreise -Inland-, p. 26: "Grundpreis: 15 EUR
//   zzgl. Provisionssatz gemäß der folgenden Preisstaffel", column "Bei
//   Auftragserteilung über Onlinebrokerage": 0,10 % in every value band
//   (0.01 to 5,000 €, 5,000.01 to 20,000 €, above 20,000 €); "Zusätzlich
//   wird die Bank die ihr bei der Auftragsausführung und -abwicklung von
//   Dritten berechneten Auslagen und fremden Kosten in Rechnung stellen";
//   "Limitvormerkung, -änderung und -streichung 0,00 EUR":
//   https://atruvia.scene7.com/is/content/atruvia/PVZ_01_04_2026pdf
//   The depot page prints "Internetorder 0,10 % vom Kurswert" and refers to
//   the PLV for "Die genaue Preisaufschlüsselung"; custody "Grundpreis 17,85
//   Euro (inkl. USt.) pro Jahr", "Festpreis je Posten 5,95 Euro (inkl. USt.)
//   pro Jahr":
//   https://www.kd-bank.de/privatkunden/geldanlange/depot.html
//
// A side: 15.00 € + 0.10 % × value, no cap. The venue's charges come on top,
// priced in ../1822direkt/germanyCost.mjs (group "dz"). Same on the buy and
// the sell. The adviser column (0.70 / 0.60 / 0.50 % by band) is not this
// trip.
//
// Cash is euro only. A non-euro Xetra line is converted at a "marktgerecht"
// rate (PLV 9.1.1; DZ BANK's GenoFX rates) with no margin printed for
// securities: N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: foreign exchanges (35 € + 25 € extra), partial
// fills on different days.
//
//   node brokers/kdbank/kdbank_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//   node brokers/kdbank/kdbank_cost.mjs IE00B4L5Y983 XFRA EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "KD-Bank",
  folder: "kdbank",
  catalogueUrl: new URL("kdbank-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/PVZ_01_04_2026pdf",
  readOn: "2026-10-26",
  entity: "Bank für Kirche und Diakonie eG - KD-Bank",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "PLV KD-Bank Stand 01.04.2026, 9.1.1 (Onlinebrokerage) relu le 2026-10-26",
  commission: ({ notionalEur }) =>
    pctFee(notionalEur, { base: 15, rate: 0.001, label: "Grundpreis + Provision Onlinebrokerage" }),
  remark: "Custody 17.85 € a year plus 5.95 € a line.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
