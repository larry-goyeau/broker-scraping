// What one round trip costs at Sheltech Brokerage: buy n shares on the
// Dhaka Stock Exchange through ShelTrade and sell them straight back, in
// dollars. Every line is in taka and the account is held in taka, so
// nothing is converted.
//
// https://www.sheltechbrokerage.com/page/details/fees-charges
// read on 2026-10-26: "The only fees and charge is the trade commission,
// account opening fees: 450 Tk. and there is no maintenance charge." "The
// commission is agreed at maximum 1% of trade value." "Prime rate for
// prime client." No other page prints a rate. The figure printed is a
// ceiling, so the owner's rule takes the max: each buy and each sell pays
// 1% of its value, as in the BRAC EPL file. The page says the commission
// is the only charge, so no DSE levy, CDBL fee or tax at source is added.
// No minimum is printed.
//
//   Each side    1 % of the amount, nothing added.
//
// Taxes come from taxMap.mjs, as in the IBSL file. Left out: the opening
// fee (450 Tk). The Bangladeshi books are not stored, so the total stays
// unknown until they are.
//
//   node brokers/sheltech/sheltech_cost.mjs GP XDHA BDT --shares=100 --price=238
//
// `roundTrip(...)` reads files, not the network.

import { dseRoundTrip, printCli } from "../mika/dseCost.mjs";

const READ_ON = "2026-10-26";

const SCHEDULE = {
  broker: "Sheltech",
  folder: "sheltech",
  catalogueUrl: new URL("sheltech-parsed.json", import.meta.url),
  url: "https://www.sheltechbrokerage.com/page/details/fees-charges",
  readOn: READ_ON,
  rate: 0.01,
  minimum: 0,
  ceiling: true,
  levies: "included",
  basis:
    `page « Fees Charges » de Sheltech relue le ${READ_ON}. Commission « au maximum 1 % » du montant, chaque sens, ` +
    `seul frais avec l'ouverture de compte (450 Tk).`,
  notes: [
    "taux prime pour les clients prime, non publié : remarque",
    "ouverture de compte (450 Tk) hors aller-retour, aucun frais de tenue",
  ],
  remark: "Prime clients pay less.",
};

export function roundTrip(query) {
  return dseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
