// What one round trip costs at AAA Equities (AAA Southeast Equities): buy n
// shares at price p, sell them back at once, in dollars. Online only.
//
// The FAQ "What are the fees with stock trading online?", read on
// 2026-10-26, with its "P100k Gross Trade Example":
//   Commission              0.25%            P250
//   VAT on Commission       12% of comm      P30
//   PSE Transaction Fee     0.005%           P5
//   SCCP Fee                0.01%            P10
//   Sales Tax               0.1% (SELL orders only)  P100
// No floor is printed. Funding: online deposits are free at BDO, Unionbank,
// Metrobank and BPI ("Deposits less than P5,000.00 will be charged a P30.00
// fee"; a ~$1,000 trip is ~P62,000, so it does not apply). Left out: stock
// transfers between brokers.
//
// Formula, each side: 0.25% + 12% VAT + PSE 0.005% + SCCP 0.01%; the sell
// adds 0.1%. Exact; the P100k example (295 buy, 395 sell) matches.
//
// Funding is in pesos at Philippine banks: the three PSE dollar lines would
// need a conversion the broker does not price: N/A.
//
//   https://aaa-equities.com.ph/faq/
//
//   node brokers/aaaequities/aaaequities_cost.mjs SM PSE PHP --shares=120 --price=497
//
// `roundTrip(...)` reads files, not the network.

import { pseRoundTrip, printCli } from "../firstmetro/pseCost.mjs";

const SCHEDULE = {
  broker: "AAA Equities",
  folder: "aaaequities",
  catalogueUrl: new URL("aaaequities-parsed.json", import.meta.url),
  url: "https://aaa-equities.com.ph/faq/",
  readOn: "2026-10-26",
  commission: { rate: 0.0025 },
};

export function roundTrip(query) {
  return pseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
