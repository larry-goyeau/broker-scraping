// What one round trip costs at DC Bank (Deposito-Cassa der Stadt Bern):
// buy n shares or ETF units on SIX Swiss Exchange through e-Banking under
// the «Execution Only» mandate and sell them straight back, in dollars.
// The SIX book, the federal stamp, the SIX fee, taxMap and the conversion
// are ../migros/sixCost.mjs (through ../graubundnerkanto/sixPlaceCost.mjs);
// this file gives the courtage and the account currencies.
//
// "Leistungen und Gebühren", 1 January 2025, read on 2026-10-26:
//   https://www.dcbank.ch/wp-content/uploads/2025/03/DCB_Leistungen_und_Gebuehren_01.01.2025-Web.pdf
//   p. 8 "Effektenhandel", "Courtage", "Kauf und Verkauf Aktien,
//   Obligationen, Anlagefonds, Exchange Traded Funds ...":
//     "Börsenplatz / Abschluss in der Schweiz", "Bis 500 000.– 1,00 %",
//     "Darüber auf Anfrage"
//     "Die Mindestcourtage beträgt CHF 100.– pro Transaktion."
//     "Abschläge – 50 % für Effektenhandel über e-Banking" (footnote 5:
//     "Gilt für den Ausführungsauftrag «Execution Only»")
//     "Die Courtage für Transaktionen bis CHF 1000.– Kurswert beträgt 10 %
//     pro Abschluss, mindestens CHF 20.–"
//     "Nicht eingeschlossene Leistungen – Börsengebühren" (the official SIX
//     fee, in the engine; DC Bank prints no amount).
// So each side: 50 % x courtage, where courtage = max(CHF 100, 1 % x
// amount), or for an amount up to CHF 1,000 min(that, max(CHF 20, 10 % x
// amount)): online CHF 50 minimum, CHF 10 to 50 below CHF 1,000. Above
// CHF 500,000 the courtage is "auf Anfrage": N/A.
// "Börsenplatz / Abschluss in der Schweiz" covers every catalogue row.
// Custody, «Execution Only»: "Bis 5 Mio. 0,35 %", "Die Mindestgebühr
// beträgt CHF 100.– pro Jahr" (p. 6): a remark.
//
// Accounts: the private "Fremdwährungskonto", "Geeignet für sämtliche
// Bankdienstleistungen in Fremdwährungen", currencies not named:
//   https://www.dcbank.ch/wp-content/uploads/2026/02/DCB_Kontosortiment_Privatkunden_LY01-DCB-Fonts_2026-Web.pdf
// CHF, EUR, USD and GBP are kept unconverted; a JPY, AUD, CAD or SGD line
// would convert at a rate DC Bank does not print, so it is N/A.
//
// Left out: the advisory tariffs, foreign exchanges (1.50 %), the fund
// savings plan, the custody fee in the total.
//
//   node brokers/dcbank/dcbank_cost.mjs NESN XSWX CHF --shares=11 --price=77.46
//   node brokers/dcbank/dcbank_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//   node brokers/dcbank/dcbank_cost.mjs NESN XSWX CHF --shares=30 --price=77.46
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, smallOrder } from "../graubundnerkanto/sixPlaceCost.mjs";

const PAGE = "https://www.dcbank.ch/wp-content/uploads/2025/03/DCB_Leistungen_und_Gebuehren_01.01.2025-Web.pdf";
const ACCOUNTS = "https://www.dcbank.ch/wp-content/uploads/2026/02/DCB_Kontosortiment_Privatkunden_LY01-DCB-Fonts_2026-Web.pdf";
const EXECUTION_ONLY = "https://www.dcbank.ch/wp-content/uploads/2024/01/Execution_Only_01.01.2024.pdf";
const RATE = 0.01;
const MIN_CHF = 100;
const UP_TO = 500000;
const ONLINE = 0.5;
const SMALL = { upTo: 1000, rate: 0.1, min: 20 };

export const roundTrip = makeRoundTrip({
  folder: "dcbank",
  brand: "DC Bank",
  catalogue: new URL("dcbank-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.35% a year, min CHF 100.",
  sources: { accounts: ACCOUNTS, executionOnly: EXECUTION_ONLY },
  commission({ amountChf }) {
    if (amountChf > UP_TO) {
      return { chf: null, basis: "courtage «Darüber auf Anfrage» au-delà de CHF 500 000.", confidence: "courtage non publiée au-delà de CHF 500 000" };
    }
    const normal = Math.max(MIN_CHF, amountChf * RATE);
    const standard = smallOrder(normal, amountChf, SMALL);
    const small = standard < normal;
    return {
      chf: standard * ONLINE,
      rate: (small ? SMALL.rate : RATE) * ONLINE,
      min: (small ? SMALL.min : MIN_CHF) * ONLINE,
      basis:
        `«Börsenplatz / Abschluss in der Schweiz» 1,00 % jusqu'à CHF 500 000, minimum CHF 100` +
        (small ? `, ordre jusqu'à CHF 1 000 : 10 %, minimum CHF 20 (ici CHF ${String(Number(standard.toFixed(2))).replace(".", ",")})` : "") +
        `, moins 50 % via e-Banking (Execution Only).`,
      confidence: "rabais e-Banking de 50 % imprimé, appliqué à la courtage calculée (minimum et petit ordre compris)",
    };
  },
});

cli(import.meta.url, roundTrip);
