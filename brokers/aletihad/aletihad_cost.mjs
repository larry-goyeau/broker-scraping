// What one round trip costs at Bank al Etihad (Jordan) in its banking app:
// buy n shares at price p, sell them back at once, in regular hours, in
// dollars. The US stocks and ETFs of the catalogue, whole or fractional.
//
// Stocks page, blog and the Fees & Charges Manual (7 Oct 2026) read
// 2026-10-26:
//   https://www.bankaletihad.com/en/personal/investments/stocks/
//   https://blog.bankaletihad.com/en/investment/how-to-start-investing-with-as-little-as-one-dollar/
//   https://websitev3-cms-cdn.bankaletihad.com/2026/10/fees-and-charges-manual-oct-7-2026-en-1.pdf
//
//   commission   Manual: "Buying or selling shares through the banking app
//                (Drive Wealth)": "0.5% per buy or sell transaction, minimum
//                USD 0.5 and maximum USD 30"; the page: "Just 0.5% per trade,
//                a $0.50 minimum, and a $30 cap".
//   SEC/TAF/CAT  not printed, so 0 (owner's rule).
//   FX           "Deposit or exchange foreign currencies fee": "Based on the
//                declared exchange rate, maximum 0.3%" (Prime clients:
//                "Foreign currency conversion fee: Free"). A range: the
//                maximum, 0.3% (owner's rule).
//
// Formula: book (605 × Q) + 2 × min(max(0.5% × amount, $0.50), $30).
//
// Routing: the Manual names DriveWealth, so a listed US line takes
// DriveWealth's Q ("drivewealth", CRD 165429).
//
// Cash: the trading account is in dollars and the bank keeps
// foreign-currency accounts, so a dollar line needs no conversion: "FX 0.3%
// when cash ≠ USD." for a client funding from dinars.
//
// Not used: the Manual's Wealth Management share-price table ("USD 25
// fixed commission per order + USD 0.02 per share", minimum USD 25 a trade,
// and up) is the Investment Department's tariff, not the app; only the app
// line counts.
//
// Left out: the 10% US withholding on the sale of a PTP ("US regulations
// (PTP): 10% shares transaction fee"), a tax on proceeds, not a fee, as in
// bamboo_cost.mjs.
//
//   node brokers/aletihad/aletihad_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/aletihad/aletihad_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const RATE = 0.005;
const MIN = 0.5;
const MAX = 30;

const SCHEDULE = {
  broker: "Bank al Etihad",
  folder: "aletihad",
  catalogueUrl: new URL("aletihad-parsed.json", import.meta.url),
  url: "https://www.bankaletihad.com/en/personal/investments/stocks/",
  readOn: "2026-10-26",
  entity: "Bank al Etihad (Jordan), DriveWealth, LLC (US broker)",
  rule606: "drivewealth",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: (ctx) => Number(Math.min(Math.max(RATE * ctx.notionalUsd, MIN), MAX).toFixed(6)),
  levies: { sec: false, taf: false, cat: false },
  fx: { rate: 0.003 },
  basis:
    "Fees & Charges Manual Bank al Etihad (7 oct. 2026) et page Stocks, relus le 2026-10-26 : " +
    "0,5 % par achat ou vente, minimum 0,50 USD, maximum 30 USD",
  notes: [
    "courtier américain DriveWealth, LLC (CRD 165429), nommé dans le barème : Q de DriveWealth",
    "retenue américaine de 10 % sur la vente d'un PTP : impôt, hors chiffre",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
