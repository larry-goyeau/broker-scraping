// What one round trip costs in the Stocks tab of the Crypto.com App (Foris
// Capital US LLC, CRD 282331, clearing at Apex Clearing Corporation): buy n
// shares at price p, sell them back at once, in the app, in regular hours,
// in dollars. US-listed stocks and ETFs.
//
// Read 2026-10-26:
//   https://crypto.com/us/stocks/stock-trading-account
//   https://help.crypto.com/en/articles/10153377-stock-and-etf-trading-via-the-crypto-com-app
//
//   commission    $0: "Buy and sell 12,000+ stocks and ETFs at zero
//                 commission", "zero commissions and no account maintenance
//                 fees"; help: "Foris Capital does not charge any fees for
//                 opening and maintaining a stock account, nor a commission
//                 for stock and ETF trading."
//   SEC           "RTF fees are charged on securities sales only, and Foris
//                 Capital will pass this fee to our customers." No rate or
//                 rounding is printed: the regulator's rate ($20.60 per
//                 $1,000,000 of the sale) rounded up to the cent, Apex's
//                 practice (Hapi's Apex schedule: "rounded up to the cent").
//   FINRA TAF     "TAFs are charged on securities sales only, and Foris
//                 Capital US LLC will pass this fee to our customers."
//                 FINRA's rate, on pause until 2026-12-31 (0 today), then
//                 $0.000195 a share sold, cap $9.79, rounded up.
//   CAT           not named: 0.
//   ADR           depositary bank fees, no amount: not in the total.
//
// Formula: book (605 × Q Apex) + 0 + SEC on the sale + TAF on the sale.
//
// Routing: the FINRA 606 bulk file, 2026 Q2 adopt-by-reference list, has
// "282331|FORIS CAPITAL US LLC|13071|APEX CLEARING CORPORATION" from 2024
// Q2. So a US line takes Apex's Q (rule606 key "apex"), and the Texas Stock
// Exchange lines the same per-symbol 605 × Q.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars ("Stocks is currently available to U.S. customers only")
// and every line is in dollars: no conversion. Card, Apple Pay or crypto
// funding is not an order cost.
//
//   node brokers/cryptocom/cryptocom_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/cryptocom/cryptocom_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Crypto.com",
  folder: "cryptocom",
  catalogueUrl: new URL("cryptocom-parsed.json", import.meta.url),
  url: "https://crypto.com/us/stocks/stock-trading-account",
  help: "https://help.crypto.com/en/articles/10153377-stock-and-etf-trading-via-the-crypto-com-app",
  readOn: "2026-10-26",
  entity: "Foris Capital US LLC (CRD 282331), clearing Apex Clearing Corporation (CRD 13071)",
  rule606: "apex",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis:
    "page Stocks et article d'aide Crypto.com, relus le 2026-10-26 : « zero commission », SEC (RTF) et TAF « pass[ed] to our customers » " +
    "aux taux des régulateurs, arrondis au centime supérieur comme chez Apex",
  notes: ["Foris Capital US adopte le 606 d'Apex Clearing par référence (bulk FINRA 2026 T2)"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
