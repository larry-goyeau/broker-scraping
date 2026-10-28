// What one round trip costs at Educators Credit Union (Wisconsin): buy n
// shares at price p, sell them back at once, online, in regular hours, in
// dollars. US exchange-listed stocks and ETFs in a self-directed portfolio of
// "Online Stock Trading" inside ECU online and mobile banking. Hybrid and
// pre-built portfolios ("Fees may apply") stay out.
//
// Platform Eko Investments Inc (RIA, CRD 313296); "Brokerage services are
// provided to clients by Alpaca Securities LLC" (CRD 288202). Pages read
// 2026-10-26:
//
//   https://www.ecu.com/digital-services/online-stock-trading/
//   https://eko.investments/legal
//
//   commission     $0 each way: "Self-directed investing is commission-free.
//                  We don't charge anything per trade or to maintain your
//                  account." and "No fee transactions for self-directed
//                  investing." (Eko's Form CRS prints a 0.3% a year
//                  management fee for its advisory portfolios; ECU says the
//                  self-directed portfolio carries no account charge.)
//   SEC / TAF / CAT  not printed, so 0 (owner's rule)
//   minimum        "Start your journey with as little as $10"
//
// Formula: book (Alpaca 605 × Q) + 0 + 0.
//
// Routing: Alpaca Securities is the broker-dealer of record, so a listed US
// line takes Alpaca's per-symbol 605 × Q (rule606 key "alpaca"); the Texas
// Stock Exchange lines read the same figure.
//
// Cash is the member's ECU checking or savings account in dollars ("Choose
// your checking or savings account from the dropdown") and every line is in
// dollars: no conversion.
//
//   node brokers/educatorscreditu/educatorscreditu_cost.mjs AAPL XNAS USD --shares=2.876 --price=347.725
//   node brokers/educatorscreditu/educatorscreditu_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Educators CU (Eko)",
  folder: "educatorscreditu",
  catalogueUrl: new URL("educatorscreditu-parsed.json", import.meta.url),
  url: "https://www.ecu.com/digital-services/online-stock-trading/",
  readOn: "2026-10-26",
  entity: "Eko Investments Inc (platform), broker-dealer Alpaca Securities LLC (CRD 288202)",
  rule606: "alpaca",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  remark: "",
  basis:
    "page Online Stock Trading d'Educators CU relue le 2026-10-26 : « Self-directed investing is commission-free. We don't charge anything per trade or to maintain your account. »",
  notes: ["investissement minimum 10 $"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
