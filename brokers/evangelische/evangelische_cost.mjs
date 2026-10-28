// What one round trip costs at Evangelische Bank eG (Kassel): buy n shares on
// Xetra or the Frankfurt floor through the Online-Brokerage (VR-ProfiBroker,
// the cooperative banks' DZ BANK brokerage) and sell them straight back, in
// dollars.
//
// https://www.eb.de/privatkunden/wertpapiere/depot.html read on 2026-10-26,
// "Kauf und Verkauf (Provisionsvergleich)", column "Ordererteilung via
// Online-Brokerage*", "Provision: ...% vom Kurswert bzw. Nennwert/Minimum":
// "Aktien/aktienähnliche Zertifikate 0,50 % / 12,00 Euro"; "Investmentanteile
// über Börse / ETF (GenoVerbund)" and "(verbundfremd)" "0,50 % / 12,00 Euro".
// "* Entgelte gelten nur nach Abschluss der Rahmenvereinbarung über die
// Nutzung des Direct Banking Angebotes für Wertpapiergeschäfte per
// Internet." Source line: "Preis- und Leistungsverzeichnis der Evangelischen
// Bank eG / Stand 01.07.2021". The bank's site links no newer price list
// (pflichtinformationen, depot and online-brokerage pages read the same
// day; https://www.eb.de/service/preis-und-leistungsverzeichnis.html is
// only an Atruvia "Serviceauftrag" request form, no document), so this
// table is the published online price. No cap is printed. The
// "Kunden-Beratung" column (1 % / 50 €) is not online.
//
// Formula, a side: 0,50 % × Kurswert, at least 12 €; plus, from
// ../1822direkt/germanyCost.mjs, the Xetra Transaktionsentgelt (Basic,
// 0,72 bp, min 0,90 €) or the Frankfurt Transaktionsentgelt (1,44 bp, min
// 0,90 €) + Handelsentgelt (5,04 bp, min 2,52 €), as every DZ-group price
// list bills third-party costs on top; the book; the FR/IT/ES FTT on the buy
// (taxMap).
//
// FX: the depot settles on a euro Girokonto at the bank ("Einzige
// Voraussetzung: Sie benötigen ein Girokonto bei uns"); a non-euro Xetra
// line is converted at the bank's rate with no margin printed: forced,
// unpublished, N/A.
// Left out: custody (no figure on the pages), limit fees, partial fills on
// other days.
//
//   node brokers/evangelische/evangelische_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "Evangelische Bank",
  folder: "evangelische",
  catalogueUrl: new URL("evangelische-parsed.json", import.meta.url),
  url: "https://www.eb.de/privatkunden/wertpapiere/depot.html",
  readOn: "2026-10-26",
  entity: "Evangelische Bank eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "page Depot de l'Evangelische Bank relue le 2026-10-26 (Provisionsvergleich, PLV Stand 01.07.2021) : " +
    "Online-Brokerage 0,50 % du Kurswert, min 12 €",
  commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.005, min: 12, label: "Online-Brokerage" }),
  remark: "",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
