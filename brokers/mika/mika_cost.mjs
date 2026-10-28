// What one round trip costs at Mika Securities: buy n shares on the Dhaka
// Stock Exchange through the Amar Biniyog app and sell them straight back,
// in dollars. Every line is in taka and the account is held in taka
// (deposits by bank transfer, cheque, cash at the bank or bKash), so
// nothing is converted.
//
// https://www.mikasecurities.net/pricing/
// read on 2026-10-26. "Standard 0.50%", "Charged on the value of each
// trade you buy or sell", "Applies to all individual accounts by default."
// Under the commission table: "Brokerage commission only. Standard DSE,
// CDBL and BSEC charges and tax deducted at source apply separately and
// are shown on your trade confirmation." No minimum is printed. The
// preferred rates for individuals and institutions run "0.50% 0.40%
// 0.35% 0.25% Negotiable", "based on trading volume and relationship".
// The foreign investor page (/foreign-invest/) prints "max 0.50%"; the
// NRB page (/nrb-invest/) prints no figure and calls it "negotiable".
//
//   Each side    0.50 % of the amount
//              + DSE laga 0.03 % + CDBL 0.0125 % (SME 0.003 %)
//              + tax at source 0.05 %   (../mika/dseCost.mjs)
//
// Remark: the lowest printed preferred rate, 0.25%, is half the standard
// one. Taxes come from taxMap.mjs, as in the IBSL file. Left out: the
// BO opening (BDT 150) and the annual BO fee (BDT 150), the IPO fees and
// the 1% on IPO-allotted shares, bKash's own fee. The Bangladeshi books
// are not stored, so the total stays unknown until they are.
//
//   node brokers/mika/mika_cost.mjs GP XDHA BDT --shares=100 --price=238
//
// `roundTrip(...)` reads files, not the network.

import { dseRoundTrip, printCli } from "./dseCost.mjs";

const READ_ON = "2026-10-26";

const SCHEDULE = {
  broker: "Mika",
  folder: "mika",
  catalogueUrl: new URL("mika-parsed.json", import.meta.url),
  url: "https://www.mikasecurities.net/pricing/",
  readOn: READ_ON,
  rate: 0.005,
  minimum: 0,
  levies: "added",
  basis:
    `page « Pricing » de Mika relue le ${READ_ON}. Commission standard 0,50 % du montant, chaque sens, ` +
    `pour tous les comptes individuels ; redevances DSE, CDBL et BSEC et impôt à la source en sus.`,
  notes: [
    "taux préférentiels 0,40 %, 0,35 % et 0,25 % puis négociables selon volume et relation : remarque",
    "page investisseurs étrangers : « max 0.50% » ; page NRB : commission négociable, sans chiffre",
    "ouverture BO (150 BDT) et frais annuels BO (150 BDT) hors aller-retour",
  ],
  remark: "Fees might be 50% lower.",
};

export function roundTrip(query) {
  return dseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
