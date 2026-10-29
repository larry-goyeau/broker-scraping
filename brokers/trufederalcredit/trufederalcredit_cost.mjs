// What one round trip costs at TRU Federal Credit Union (South Carolina): buy
// n shares at price p, sell them back at once, online, in regular hours, in
// dollars. US exchange-listed stocks and ETFs in the InvestiFi investment
// portal inside TRU online banking. Crypto (its own fee schedule on the same
// page: $0.99 minimum, 2.99% to $1,000, 1.75% to $5,000) and Guided Investing
// stay out.
//
// Broker InvestiFi Securities LLC (CRD 289604), clearing and custody RQD
// Clearing LLC (CRD 134284). Investment portal page read 2026-10-26:
//
//   https://tru-fcu.org/investment-portal/
//
//   commission     $0 each way: "The cost to trade securities is free"; the
//                  InvestiFi Securities Customer Agreement (section 23, the
//                  same as the other InvestiFi credit unions): "We do not
//                  currently charge fees, such as commissions, mark-ups or
//                  otherwise, on Customer Account transactions"
//   SEC / TAF / CAT  SEC and TAF added at the regulators' rates on the sale,
//                    rounded up to the cent (Frankenmuth CU, on the same
//                    InvestiFi platform, prints the SEC fee; owner,
//                    2026-10-28). CAT: no rate printed, 0.
//   minimum        "The minimum purchase for securities is $1.00"; TRU's page
//                  prints no per-order cap
//
// Formula: book (quoted NBBO, see below) + 0 + SEC and TAF on the sale.
//
// Routing: InvestiFi files no 606 of its own. The FINRA 606 bulk file, 2026
// Q2 adopt-by-reference list, has "289604|INVESTIFI SECURITIES LLC|134284|RQD*
// CLEARING, LLC" (2025 Q4 and 2026 Q1). RQD's 2026 Q2 report is not in that
// zip; spreads/rule606.mjs reads it on FINRA's CDN (key `rqd`): the book is
// the blended 605 × that 606's Q.
//   https://cdn.finra.org/606/2026/134284_606_NMS_2026_Q2_V1.xml
//
// Cash is the member's TRU account in dollars and every line is in dollars:
// no conversion.
//
//   node brokers/trufederalcredit/trufederalcredit_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/trufederalcredit/trufederalcredit_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "TRU FCU",
  folder: "trufederalcredit",
  catalogueUrl: new URL("trufederalcredit-parsed.json", import.meta.url),
  url: "https://tru-fcu.org/investment-portal/",
  readOn: "2026-10-26",
  entity: "InvestiFi Securities LLC (CRD 289604), clearing RQD Clearing LLC (CRD 134284)",
  // InvestiFi adopts RQD Clearing's 606 by reference; key `rqd`.
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  remark: "",
  basis: "page Investment Portal de TRU FCU relue le 2026-10-26 : « The cost to trade securities is free » (InvestiFi Securities, accord client section 23)",
  notes: ["achat minimum 1 $"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
