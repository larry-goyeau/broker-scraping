// What one round trip costs at UmweltBank AG (Nürnberg) in its online
// brokerage: buy n shares on the Frankfurt floor (Börse Frankfurt, XFRA)
// online and sell them straight back, in dollars.
//
// https://www.umweltbank.de/download/f003
// read on 2026-10-26, Preise für Dienstleistungen im standardisierten
// Geschäftsverkehr mit privaten Kunden, Stand 24.09.2026, 8.1.1 Kauf und
// Verkauf (Provision): shares, "Investmentanteile", "sonstige Wertpapiere",
// "börslich gehandelt", "Ausführungen im Inland": "7,90 EUR zzgl. 0,25 % vom
// Kurswert" (no floor, no cap; "im Ausland" adds "mind. 69,90 EUR", another
// place). "Zusätzlich wird die Bank die ihr bei der Auftragsausführung und
// -abwicklung von Dritten berechneten Auslagen und fremden Kosten in Rechnung
// stellen." The depot page prints the same for depots opened since 01.07.2026:
// "Ordergebühren Kauf / Verkauf 7,90 € + 0,25 % vom Ordervolumen"
// https://www.umweltbank.de/investieren/depot/
// Older depots keep their former conditions (not priced here).
//
// Formula, a side: 7,90 € + 0,25 % × Kurswert; plus, from
// ../1822direkt/germanyCost.mjs, the Frankfurt Transaktionsentgelt (Basic,
// 1,44 bp, min 0,90 €) + Handelsentgelt (5,04 bp, min 2,52 €); the book; the
// FR/IT/ES FTT on the buy (taxMap). Group "dz": the bank runs on Atruvia
// (SecureGo plus TAN app), which only matters on Tradegate, not in this
// Frankfurt-only catalogue.
//
// FX: euro accounts (Girokonto/Tagesgeld). Frankfurt lines are all EUR, so no
// conversion; for a non-euro line "wird der Wechselkurs durch ein Verfahren
// ermittelt, bei dem die Marktgerechtigkeit des Wechselkurses sichergestellt
// ist": no margin printed, so a forced FX and N/A.
// Custody (8.2.1): 0,25 % p.a. on shares and other securities (ETC/ETN
// included), 0,10 % p.a. on "Investmentanteile" (funds, ETFs), Selektion free:
// a remark.
// Left out: "Limitvormerkung 2,50 EUR pro Auftrag" (only when the order is
// not executed), partial fills on other days (each billed as an order),
// Sparplan 1,90 €.
//
//   node brokers/umweltbank/umweltbank_cost.mjs DE0007164600 XFRA EUR --shares=4 --price=250
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const FUND_TYPES = new Set(["ETF", "FUND"]);

const SCHEDULE = {
  broker: "UmweltBank",
  folder: "umweltbank",
  catalogueUrl: new URL("umweltbank-parsed.json", import.meta.url),
  url: "https://www.umweltbank.de/download/f003",
  readOn: "2026-10-26",
  entity: "UmweltBank AG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "PLV UmweltBank Stand 24.09.2026, 8.1.1, börslich gehandelt, Ausführungen im Inland : 7,90 € + 0,25 % du Kurswert, sans minimum ni plafond",
  commission: ({ notionalEur }) => pctFee(notionalEur, { base: 7.9, rate: 0.0025, label: "Provision Inland" }),
  remark: ({ listing }) =>
    FUND_TYPES.has(String(listing?.type || "").toUpperCase()) ? "Custody is 0.10% a year." : "Custody is 0.25% a year.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
