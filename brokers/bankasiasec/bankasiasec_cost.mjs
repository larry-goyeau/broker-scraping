// What one round trip costs at Bank Asia Securities (BASL): buy n shares
// on the Dhaka Stock Exchange through the DSE Mobile or DSE Investor app
// and sell them straight back, in dollars. Every line is in taka and the
// account is held in taka, so nothing is converted.
//
// https://www.basl-bd.com/home/commissionrate
// read on 2026-10-26, "Attractive Brokerage Commission Rate": "'Absolute
// Cash Account' offers attractive brokerage commission @0.30% only for the
// cash transaction having any other investors without hidden costs or
// charges." It is the only rate the site prints (brokerage services,
// smart phone trading and the DSE Investor guide print none), so each buy
// and each sell of a cash account pays 0.30% of its value. "Without hidden
// costs or charges" is read as the levies being inside that rate, so no
// DSE levy, CDBL fee or tax at source is added, as in the IBSL file. No
// minimum is printed. Margin accounts have no printed rate.
//
//   Each side    0.30 % of the amount, nothing added.
//
// Taxes come from taxMap.mjs, as in the IBSL file. Left out: the BO
// opening and annual fees (not printed). The Bangladeshi books are not
// stored, so the total stays unknown until they are.
//
//   node brokers/bankasiasec/bankasiasec_cost.mjs GP XDHA BDT --shares=100 --price=238
//
// `roundTrip(...)` reads files, not the network.

import { dseRoundTrip, printCli } from "../mika/dseCost.mjs";

const READ_ON = "2026-10-26";

const SCHEDULE = {
  broker: "Bank Asia Securities",
  folder: "bankasiasec",
  catalogueUrl: new URL("bankasiasec-parsed.json", import.meta.url),
  url: "https://www.basl-bd.com/home/commissionrate",
  readOn: READ_ON,
  rate: 0.003,
  minimum: 0,
  levies: "included",
  basis:
    `page « Attractive Commission Rate » de BASL relue le ${READ_ON}. Compte « Absolute Cash Account » : ` +
    `commission 0,30 % du montant, chaque sens, pour les opérations au comptant, « sans frais cachés ».`,
  notes: [
    "seul taux imprimé par le site : pages services de courtage et trading mobile sans taux",
    "« without hidden costs or charges » lu comme redevances comprises",
    "aucun taux publié pour les comptes sur marge",
  ],
  remark: "",
};

export function roundTrip(query) {
  return dseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
