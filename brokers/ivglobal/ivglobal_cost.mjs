// What one round trip costs at I V Global Securities PCL: buy n shares at
// price p on the Stock Exchange of Thailand (SET / mai) through IVG Gold or
// Settrade Streaming, sell them back, in dollars. Every catalogue line is a
// baht SET line.
//
// Tariff read 2026-10-26 (no login):
//   https://www.ivglobal.co.th/content/articles/brokerages-fees.html
//   "Individual Client : Trading Fees", "Trading Value per Day (X Baht)",
//   "Trade via Internet Channel", "Cash Balance Account":
//     X ≤ 5 MB 0.15 % + VAT 7 %, 5–10 MB 0.13 %, 10–20 MB 0.11 %,
//     X > 20 MB 0.10 % (each + VAT 7 %)
//   "Minimum commission fee per day 50 Baht + VAT 7%"
//   "Charging Fee": SET Trading Fee 0.005 %, TSD Clearing Fee 0.001 %, SEC
//   Regulatory Fee 0.001 %; the page's intro charges them with VAT 7 %.
//
// Formula, each side: max(scale on the day's value, 50 baht) × 1.07
// + 0.007 % × 1.07; both sides + the SET book (../kgithailand/setCost.mjs).
//
// Priced account: Cash Balance. Left out: the Cash Account (internet
// 0.20 %, "ATS Settlement Fee for Cash Account 14 Baht + VAT 7%"), opened on
// a credit line; institutional rates; investment-consultant rates.
//
//   node brokers/ivglobal/ivglobal_cost.mjs PTT "Stock Exchange of Thailand" THB --shares=1000 --price=33
//   node brokers/ivglobal/ivglobal_cost.mjs 1DIV SET THB --shares=2500 --price=13
//   node brokers/ivglobal/ivglobal_cost.mjs PTT SET THB --shares=10000 --price=33
//   node brokers/ivglobal/ivglobal_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { makeSetCost, printSetCli } from "../kgithailand/setCost.mjs";

const READ_ON = "2026-10-26";

export const SCALE = [
  { upTo: 5e6, rate: 0.0015 },
  { upTo: 10e6, rate: 0.0013 },
  { upTo: 20e6, rate: 0.0011 },
  { upTo: Infinity, rate: 0.001 },
];
export const MIN = 50;

export const roundTrip = makeSetCost({
  folder: "ivglobal",
  name: "I V Global Securities",
  catalogue: new URL("ivglobal-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.ivglobal.co.th/content/articles/brokerages-fees.html",
    readOn: READ_ON,
    entity: "I V Global Securities PCL",
    account: "internet, Cash Balance",
  },
  scale: SCALE,
  min: MIN,
  basis:
    `barème I V Global relu le ${READ_ON} : internet, compte Cash Balance, 0,15 % jusqu'à 5 M THB par jour, ` +
    `0,13 % jusqu'à 10 M, 0,11 % jusqu'à 20 M, 0,10 % au-delà, minimum ${MIN} THB par jour, TVA 7 % en sus`,
});

printSetCli(roundTrip, import.meta.url);
