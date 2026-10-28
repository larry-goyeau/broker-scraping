// What one round trip costs at Summit Choice Credit Union: buy n shares at
// price p, sell them back at once, online, in regular hours (9:30-16:00 ET),
// in dollars. US exchange-listed stocks and ETFs in the InvestiFi
// Self-Directed Investment Portal inside the Summit Choice CU app and online
// banking. Guided Investing (0.50% a year) stays out.
//
// Broker InvestiFi Securities LLC (CRD 289604), clearing and custody RQD*
// Clearing LLC (CRD 134284). Securities & ETFs page read 2026-10-26:
//
//   https://www.summitchoice.org/Accounts/Invest/Securities-ETFs
//
//   commission     $0 each way: "zero commissions on trades" and "with no
//                  fees for purchasing"
//   SEC / TAF / CAT  not printed on the page, so 0 (owner's rule)
//   limits         "starting at just $1.00", "Minimum sell orders are just
//                  $1.10", "You can buy up to $100k of stocks and ETFs in a
//                  single transaction" (none bites a $1,000 trip)
//
// Formula: book (quoted NBBO, see below) + 0 + 0.
//
// Routing: InvestiFi files no 606 of its own. The FINRA 606 bulk file, 2026
// Q2 adopt-by-reference list, has "289604|INVESTIFI SECURITIES LLC|134284|RQD*
// CLEARING, LLC" (2025 Q4 and 2026 Q1). RQD's 2026 Q2 report is not in that
// zip; spreads/rule606.mjs reads it on FINRA's CDN (key `rqd`): the book is
// the blended 605 × that 606's Q. The Texas Stock Exchange lines read the
// same figure.
//   https://cdn.finra.org/606/2026/134284_606_NMS_2026_Q2_V1.xml
//
// Cash is the member's Summit Choice checking account in dollars ("Fund your
// investment purchases directly from your Summit Choice CU checking account")
// and every line is in dollars: no conversion.
//
//   node brokers/summitchoicecred/summitchoicecred_cost.mjs AAPL XNAS USD --shares=2.876 --price=347.725
//   node brokers/summitchoicecred/summitchoicecred_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Summit Choice CU",
  folder: "summitchoicecred",
  catalogueUrl: new URL("summitchoicecred-parsed.json", import.meta.url),
  url: "https://www.summitchoice.org/Accounts/Invest/Securities-ETFs",
  readOn: "2026-10-26",
  entity: "InvestiFi Securities LLC (CRD 289604), clearing RQD* Clearing LLC (CRD 134284)",
  // InvestiFi adopts RQD Clearing's 606 by reference; RQD has no key yet.
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  remark: "",
  basis:
    "page Securities & ETFs de Summit Choice CU relue le 2026-10-26 : « zero commissions on trades », « no fees for purchasing » (InvestiFi Securities, compensation RQD* Clearing)",
  notes: ["achat minimum 1 $, vente minimum 1,10 $, achat maximum 100 000 $ par ordre"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
