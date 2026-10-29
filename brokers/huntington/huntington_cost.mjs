// What one round trip costs in the self-directed brokerage account that
// Huntington Bank's SmartInvest clients open with Huntington Financial
// Advisors (Ameriprise Financial Services, LLC): buy n shares at price p,
// sell them back at once, as market orders entered online at ameriprise.com,
// in regular hours, in dollars. US stocks and ETFs.
//
// Read 2026-10-26:
//   https://www.huntington.com/Personal/savings-cds-overview/smartinvest-money-market-account
//   https://www.huntington.com/private-bank/solutions/banking-lending/smartinvest
//   https://www.ameriprise.com/customer-service/brokerage-accounts-custodial-fees
//
//   commission      $0: "unlimited commission-free, trades for equities and
//                   exchange-traded funds, limited to self-directed orders
//                   entered as market orders ... through the secure site at
//                   ameriprise.com".
//   order handling  $6 an order, each way: "An order handling fee of $6.00
//                   will still apply to these orders." Ameriprise's schedule
//                   prints "Brokerage Retail Order Handling Fees $6 per
//                   trade".
//   SEC / TAF / CAT Ameriprise prints a "Transaction Fee ... Variable" on
//                   some sells ("a nominal transaction fee to cover costs of
//                   self-regulation may be charged", "only assessed on
//                   sells") with no rate: the SEC's rate, rounded up to the
//                   cent. TAF and CAT not named, 0.
//   account fee     Ameriprise Brokerage Account $100 a year ($25 a
//                   quarter), waived for Achiever Circle Elite households
//                   ($500,000 or more at Ameriprise): remark, not the trip.
//   limit/stop      outside the commission-free offer; not this trip.
//
// Formula: book + $6 + $6 + SEC on the sale. Ameriprise Financial Services, LLC (CRD 6363)
// clears through American Enterprise Investment Services Inc. (CRD 26506),
// which files the 606: key `aeis` in spreads/rule606.mjs, the book is the
// blended 605 × that 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/huntington/huntington_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/huntington/huntington_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const ORDER_HANDLING = 6;

const SCHEDULE = {
  broker: "Huntington Bank",
  folder: "huntington",
  catalogueUrl: new URL("huntington-parsed.json", import.meta.url),
  url: "https://www.huntington.com/Personal/savings-cds-overview/smartinvest-money-market-account",
  feeSchedule: "https://www.ameriprise.com/customer-service/brokerage-accounts-custodial-fees",
  readOn: "2026-10-26",
  entity: "Huntington Financial Advisors (Ameriprise Financial Services, LLC, CRD 6363)",
  rule606: "aeis",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => ({ buy: ORDER_HANDLING, sell: ORDER_HANDLING, note: `0 $ de commission + frais de traitement d'ordre ${ORDER_HANDLING} $ à l'achat et à la vente` }),
  levies: { sec: "up", taf: false, cat: false },
  remark: "Account fee $100/year below $500,000 at Ameriprise. Needs a funded managed account, which has an advisory fee.",
  basis:
    "pages SmartInvest de Huntington et barème Ameriprise, relus le 2026-10-26 : ordres au marché en ligne sur ameriprise.com " +
    "sans commission, « An order handling fee of $6.00 will still apply »",
  notes: [
    "« Transaction Fee » Ameriprise sur certaines ventes, taux non imprimé : 0",
    "606 de American Enterprise Investment Services (CRD 26506), 2026 T2",
    "frais de compte 100 $/an (25 $/trimestre, levés dès 500 000 $ chez Ameriprise) hors trajet",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
