// What one round trip costs at Berliner Volksbank eG in its Depot Aktiv:
// buy n shares on Xetra or the Frankfurt floor through the online order
// (OnlineBanking or VR Banking App, the cooperative banks' DZ BANK
// brokerage) and sell them straight back, in dollars.
//
// https://atruvia.scene7.com/is/content/atruvia/preisverzeichnis-wertpapierdienstleistungenpdf
// read on 2026-10-26, "Preis- und Leistungsverzeichnis für
// Wertpapierdienstleistungen", Stand 19.05.2026, 1.1 Kommissionsgeschäft,
// "Online-Order für Aktien, Optionsscheine, Investmentanteile, aktienähnliche
// Werte, Renten ...": "4,90 € zzgl. 0,250 % vom Kurswert, insgesamt mind.
// 9,90 €". The "Maximalpreis für Online-Order 39,00 €" sits in the column of
// the closed "Depot Aktiv - Paket Profi (nur Bestand)", so no cap for a new
// Depot Aktiv. The same figures on the Depot Aktiv page ("Grundpreis 4,90
// Euro zzgl. ... 0,25 % Mindestpreis 9,90 Euro"):
// https://www.berliner-volksbank.de/privatkunden/anlegen-sparen/depot.html
// Depot Komfort, Paket Profi and the Premium packages are "nur Bestand";
// MeinDepot Premium is Private Banking only, priced in a flat fee, and the
// Private Banking "Depot Premium Plus" has the same online price: none of
// them is another row. Service-Orders (branch/phone) are not this trip.
//
// Formula, a side: 4,90 € + 0,25 % × Kurswert, at least 9,90 €; plus, from
// ../1822direkt/germanyCost.mjs, the Xetra Transaktionsentgelt (Basic,
// 0,72 bp, min 0,90 €) or the Frankfurt Transaktionsentgelt (1,44 bp, min
// 0,90 €) + Handelsentgelt (5,04 bp, min 2,52 €), which the bank passes on
// ("Neben den nachfolgend aufgeführten Kosten können ... weitere Kosten ...
// entstehen"); the book; the FR/IT/ES FTT on the buy (taxMap).
//
// FX: the account is in euro. A non-euro Xetra line is converted at the
// bank's own rate with no margin printed: forced and unpublished, N/A.
// Custody: Depot Aktiv 0,00 € with one exchange trade of 10 € a quarter and
// the electronic mailbox; not a remark.
// Left out: limit fees (free), "Zuschlag für Orders an ausländischen
// Börsenplätzen 30,00 €" (another place), partial fills on other days.
//
//   node brokers/berlinervolksban/berlinervolksban_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "Berliner Volksbank",
  folder: "berlinervolksban",
  catalogueUrl: new URL("berlinervolksban-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/preisverzeichnis-wertpapierdienstleistungenpdf",
  readOn: "2026-10-26",
  entity: "Berliner Volksbank eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "PLV Berliner Volksbank Stand 19.05.2026, 1.1, Depot Aktiv, Online-Order : 4,90 € + 0,25 % du Kurswert, min 9,90 €, sans plafond",
  commission: ({ notionalEur }) => pctFee(notionalEur, { base: 4.9, rate: 0.0025, min: 9.9, label: "Online-Order" }),
  remark: "",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
