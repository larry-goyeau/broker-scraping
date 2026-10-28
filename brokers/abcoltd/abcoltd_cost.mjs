// What one round trip costs at AB & Co. Ltd.: buy n shares on the Dhaka
// Stock Exchange through the DSE Mobile or DSE Investor app and sell them
// straight back, in dollars. Every line is in taka and the account is held
// in taka, so nothing is converted.
//
// https://www.abcdsebroker.com/fees
// read on 2026-10-26, "Fee Schedule": "Transaction Fee 0.5%", "BO Opening
// Fee 450/-", "BO Renewal Fee 150/-", "DSE Mobile & DSE Investor App 125",
// "IPO Share Sale 1%", and under the table: "All fees are subject to
// applicable government taxes and levies as per BSEC regulations." So each
// buy and each sell pays 0.5% of its value, and the exchange levies and
// the tax at source come on top. No minimum is printed.
//
//   Each side    0.50 % of the amount
//              + DSE laga 0.03 % + CDBL 0.0125 % (SME 0.003 %)
//              + tax at source 0.05 %   (../mika/dseCost.mjs)
//
// Taxes come from taxMap.mjs, as in the IBSL file. Left out: the BO
// opening and renewal fees, the app line "125" (no unit is printed; the
// DSE bills its app per user per year, not per trade), the IPO fees. The
// Bangladeshi books are not stored, so the total stays unknown until they
// are.
//
//   node brokers/abcoltd/abcoltd_cost.mjs GP XDHA BDT --shares=100 --price=238
//
// `roundTrip(...)` reads files, not the network.

import { dseRoundTrip, printCli } from "../mika/dseCost.mjs";

const READ_ON = "2026-10-26";

const SCHEDULE = {
  broker: "AB & Co.",
  folder: "abcoltd",
  catalogueUrl: new URL("abcoltd-parsed.json", import.meta.url),
  url: "https://www.abcdsebroker.com/fees",
  readOn: READ_ON,
  rate: 0.005,
  minimum: 0,
  levies: "added",
  basis:
    `page « Fee Schedule » d'AB & Co. relue le ${READ_ON}. « Transaction Fee » 0,5 % du montant, chaque sens, ` +
    `taxes et redevances publiques en sus selon la page.`,
  notes: [
    "ligne « DSE Mobile & DSE Investor App 125 » sans unité, pas par ordre : laissée de côté",
    "ouverture BO (450 BDT) et renouvellement BO (150 BDT) hors aller-retour",
  ],
  remark: "",
};

export function roundTrip(query) {
  return dseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
