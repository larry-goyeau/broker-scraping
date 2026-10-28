// What one round trip costs at Albert: buy n shares at price p, sell them
// back at once, online in the Albert app, in regular hours, in dollars. US
// exchange-listed stocks and ETFs in a self-directed individual cash
// account. Strategies managed by Albert (Albert Investments, LLC) stay out.
//
// Albert Securities, LLC, clearing and custody at Apex Clearing Corporation.
// Help-centre articles read 2026-10-26 through the Zendesk API (the pages
// themselves sit behind a bot wall):
//
//   https://help.albert.com/hc/en-us/articles/16795407078423   (Commissions and Fees, updated 2026-08-26)
//   https://help.albert.com/hc/en-us/articles/16988195034135   (How does Investing work?)
//   https://help.albert.com/hc/en-us/articles/16795497158551   (Order Handling Disclosure)
//   https://help.albert.com/hc/en-us/articles/16795239408663   (Order Routing and PFOF Disclosure)
//   https://help.albert.com/hc/en-us/articles/21583583733271   (How much does Albert cost? Standard $19.99, Genius and Family $39.99 a month)
//   https://albert.com/about/investing
//
//   commission     "US Listed Equity Securities and ETFs - $0" each way
//                  ("self-directed individual cash brokerage accounts that
//                  trade U.S. exchange listed securities (including ETFs) via
//                  the Albert app")
//   SEC / TAF      "FINRA & SEC Regulatory Fees - $0": none passed on
//   CAT            not printed, so 0
//   subscription   "Albert Investing is offered to subscribers on select
//                  Albert plans"; "Albert subscription plans range from
//                  $19.99/mo to $39.99/mo": a monthly charge, not per order,
//                  so a remark, not in the total
//   ACATS out $75, returned items $30: not part of the trip
//
// Formula: book (605 × Apex's Q) + 0 + 0.
//
// Orders are market, "not held" ("Albert Securities does not currently allow
// limit, stop, and other types of orders"); fractional and whole-share orders
// are "executed by Albert Securities in a Principal or Riskless Principal
// capacity through Apex", sales at the NBBO. Albert publishes no 606(a)(1)
// report (its orders are not held) and is not on the FINRA 2026 Q2
// adopt-by-reference list; the dealer it names is Apex, so a US line takes
// Apex's Q (rule606 key "apex"), as Hapi and Public do. The Texas Stock
// Exchange lines read the same per-symbol 605 × Q.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars only (a US bank account is required) and every line is in
// dollars: no conversion.
//
//   node brokers/albert/albert_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/albert/albert_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Albert",
  folder: "albert",
  catalogueUrl: new URL("albert-parsed.json", import.meta.url),
  url: "https://help.albert.com/hc/en-us/articles/16795407078423",
  readOn: "2026-10-26",
  entity: "Albert Securities, LLC, clearing Apex Clearing Corporation",
  // No 606 of its own; executes through Apex, the dealer it names.
  rule606: "apex",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  remark: "Investing needs an Albert plan from $19.99 a month.",
  basis: "barème « Commissions and Fees » d'Albert (mis à jour le 2026-08-26), relu le 2026-10-26 : actions et ETF cotés aux États-Unis 0 $, frais FINRA et SEC 0 $",
  notes: ["ordres au marché « not held » exécutés par Albert Securities via Apex : Q d'Apex"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
