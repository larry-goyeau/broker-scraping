// What one round trip costs on Mashreq's "US Stocks & ETFs" platform
// (Mashreq NEO, Mashreq Mobile App): buy n shares at price p, sell them back
// at once, in regular hours, in dollars. The 3,000 US stocks and ETFs of
// the catalogue, whole or fractional.
//
// Mashreqbank PSC is the introducing broker; orders go to "a third-party
// executing broker, DriveWealth LLC". Key Facts Statement (Version: April
// 2025) read in full 2026-10-26, and the product page the same day:
//   https://mashreq.com/-/jssmedia/campaigns-media/pb-campaigns/investments-us-stocks-etf/investments-us-stocks-etf-kfs-en-ar.ashx
//   https://www.mashreq.com/en/uae/neo/investments/investments-us-stocks-etf/
//
//   commission   "Your first 10 executed or pending orders each month are
//                completely free. After that, a 0.2% fee applies to each
//                trade, based on the investment amount, with a minimum fee
//                of USD 1." Each order, so each way.
//   VAT          "A 5% VAT will also be charged on the fee amount if
//                applicable." The KFS's own example adds it ("USD 1,000
//                trade ... USD 2.10 in fees and VAT"), so it is in the total.
//   SEC/TAF/CAT  not printed by Mashreq, so 0 (owner's rule).
//
// Formula: book (605 × Q) + 0. The ten free orders a month take the trip
// (owner, 2026-10-27: a monthly allowance counts as free); the tariff after
// them, 2 × max(0.2% × amount, $1) × 1.05, is the remark.
//
// Routing: DriveWealth, LLC (CRD 165429) executes, so a listed US line takes
// DriveWealth's Q ("drivewealth" in spreads/rule606.mjs). The TXSE dual
// listings read the same per-symbol 605.
//
// Cash: the DriveWealth trading account is in dollars and Mashreq offers
// USD current accounts, so a dollar line needs no conversion. The page's
// "Preferential FX rates" for AED funding carry no figure, so no FX remark.
//
// Left out: nothing else is printed (no custody, no account fee).
//
//   node brokers/mashrequsetfs/mashrequsetfs_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/mashrequsetfs/mashrequsetfs_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const RATE = 0.002;
const MIN = 1;
const VAT = 0.05;
const FREE_ORDERS = 10;

const SCHEDULE = {
  broker: "Mashreq US Stocks & ETFs",
  folder: "mashrequsetfs",
  catalogueUrl: new URL("mashrequsetfs-parsed.json", import.meta.url),
  url: "https://mashreq.com/-/jssmedia/campaigns-media/pb-campaigns/investments-us-stocks-etf/investments-us-stocks-etf-kfs-en-ar.ashx",
  readOn: "2026-10-26",
  entity: "Mashreqbank PSC (introducing broker), DriveWealth, LLC (executing broker)",
  rule606: "drivewealth",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  remark: `If more than ${FREE_ORDERS} orders a month, fees are ${RATE * 100}% (min $${MIN}) plus ${VAT * 100}% VAT.`,
  basis:
    "Key Facts Statement Mashreq US stocks and ETFs (avril 2025), relu le 2026-10-26 : " +
    "10 ordres gratuits par mois, puis 0,2 % du montant par ordre, minimum 1 USD, + TVA 5 % sur la commission",
  notes: [
    "exécution chez DriveWealth, LLC (CRD 165429) : Q de DriveWealth",
    "10 ordres gratuits par mois : aller-retour compté dans la franchise (0 $), le tarif au-delà en remarque",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
