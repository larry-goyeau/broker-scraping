// What one round trip costs at Uniroyal Securities (uTrade): buy n shares on
// the Dhaka Stock Exchange through the uTrade web portal or app and sell
// them straight back, in dollars. Every line is in taka and the account is
// funded in taka (BEFTN, RTGS, cheque), so nothing is converted.
//
// https://utrade.com.bd/#faq read on 2026-10-26. "Are there any fees
// associated with UTRADE?" prints: "Stock, bonds and mutual fund trades
// typically cost 0.50% on Turnover Value with a minimum BDT 10/= per trade,
// whichever is higher. (BDT 500/= per BDT 100,000 turnover)", "Account
// Opening Fee is BDT 500/=", "Annual Maintenance Fee is BDT 450/= per
// annum", transfers and pledging 0.07%, demat BDT 200 + 0.10%, "Account
// Closing Fee is BDT 200/=". "Typically" names no other rate and no range,
// so 0.50% is the rate. The page names no DSE, CDBL or tax-at-source charge
// on top, so none is added, as in the IDLC and LankaBangla files.
//
//   Each side    max(10 BDT, 0.50 % of the amount).
//
// Taxes come from taxMap.mjs, as in the IBSL file. Left out: the yearly
// maintenance fee (BDT 450), the opening (500) and closing (200) fees,
// transfer, pledge and demat charges, margin interest. The Bangladeshi
// books are not stored, so the total stays unknown until they are.
//
//   node brokers/uniroyal/uniroyal_cost.mjs GP XDHA BDT --shares=516 --price=238
//
// `roundTrip(...)` reads files, not the network.

import { dseRoundTrip, printCli } from "../mika/dseCost.mjs";

const SCHEDULE = {
  broker: "Uniroyal",
  folder: "uniroyal",
  catalogueUrl: new URL("uniroyal-parsed.json", import.meta.url),
  url: "https://utrade.com.bd/#faq",
  readOn: "2026-10-26",
  rate: 0.005,
  minimum: 10,
  ceiling: false,
  levies: "out",
  basis:
    "FAQ uTrade d'Uniroyal Securities relue le 2026-10-26, question « Are there any fees associated with UTRADE? ». " +
    "Commission 0,50 % du montant, minimum 10 BDT par ordre, chaque sens, même taux pour actions, obligations et fonds.",
  notes: [
    "« typically » sans autre taux ni fourchette : 0,50 % retenu",
    "frais annuels (450 BDT), ouverture (500 BDT) et clôture (200 BDT) hors aller-retour",
  ],
  remark: "",
  onlineBuy: true,
};

export function roundTrip(query) {
  return dseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
