// What one round trip costs at Mondol Securities: buy n shares on the
// Dhaka Stock Exchange through the DSE Mobile app and sell them straight
// back, in dollars. Every line is in taka and the account is held in taka,
// so nothing is converted.
//
// https://www.mondolsecurities.com/ ("Charges" section)
// read on 2026-10-26: "0.45% Commission For Buying and Selling", "Buy
// Shares: 0.45%", "Sell Shares: 0.45%", "BO Opening Fee: 500 BDT",
// "Minimum A/C Balance: 500 BDT", "DSE Mobile App: Free", "IPO Share Sell:
// 1%". So each buy and each sell pays 0.45% of its value. The section
// names no exchange levy, CDBL fee or tax at source, so none is added, as
// in the IDLC and LankaBangla files. No minimum is printed; the 500 BDT
// minimum balance is cash kept in the account, not a fee.
//
//   Each side    0.45 % of the amount.
//
// Taxes come from taxMap.mjs, as in the IBSL file. Left out: the BO
// opening fee (500 BDT), the IPO fees. The Bangladeshi books are not
// stored, so the total stays unknown until they are.
//
//   node brokers/mondol/mondol_cost.mjs GP XDHA BDT --shares=100 --price=238
//
// `roundTrip(...)` reads files, not the network.

import { dseRoundTrip, printCli } from "../mika/dseCost.mjs";

const READ_ON = "2026-10-26";

const SCHEDULE = {
  broker: "Mondol",
  folder: "mondol",
  catalogueUrl: new URL("mondol-parsed.json", import.meta.url),
  url: "https://www.mondolsecurities.com/#charges",
  readOn: READ_ON,
  rate: 0.0045,
  minimum: 0,
  levies: "out",
  basis:
    `section « Charges » du site de Mondol relue le ${READ_ON}. Commission 0,45 % du montant, à l'achat et à la vente.`,
  notes: [
    "solde minimum de 500 BDT : argent gardé sur le compte, pas un frais",
    "application DSE Mobile gratuite ; ouverture BO (500 BDT) hors aller-retour",
  ],
  remark: "",
};

export function roundTrip(query) {
  return dseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
