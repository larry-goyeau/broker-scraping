// What one round trip costs at KGI Securities (Thailand) PCL: buy n shares
// at price p on the Stock Exchange of Thailand (SET / mai) through KGI POWER
// TRADE or Streaming, sell them back, in dollars. Every catalogue line is a
// baht SET line.
//
// Tariff read 2026-10-26 (PDF "As of 7 March 2025", no login):
//   https://www.kgieworld.co.th/corporate/media/pdf/feerate/eq-commission-th.pdf
//   "มูลค่าการซื้อขาย (X) ต่อวัน", internet, "บัญชี Cash Balance & Credit
//   Balance" brokerage rate:
//     X ≤ 5 ล้านบาท 0.150 %, 5–10 ล้าน 0.130 %, 10–20 ล้าน 0.110 %,
//     X > 20 ล้านบาท 0.100 %
//   "ค่าธรรมเนียม SET, TSD, SEC 0.007%": SET Trading Fee 0.005 %, TSD
//   Clearing Fee 0.001 %, SEC Regulatory Fee 0.001 %
//   "ทุกประเภทบัญชีและทุกช่องทางการส่งคำสั่ง ยังไม่รวมภาษีมูลค่าเพิ่ม 7%"
//   Since 2 Dec 2024, E-Statement clients pay commission on the actual value
//   "โดยไม่มีค่า Commission ขั้นต่ำ (50 บาท)": no minimum.
//
// Formula, each side: scale on the day's value (the order's value) × 1.07
// + 0.007 % × 1.07; both sides + the SET book (../kgithailand/setCost.mjs).
//
// Priced account: Cash Balance, the account funded in full before trading
// that any client can open. Left out: the Cash account (internet 0.200 %,
// ATS 14.98 baht a settlement) needs a credit line approved on financial
// proof and 20 % collateral; LiVE Exchange (same 0.150 % plus a 15-baht
// clearing fee and gross settlement) is a separate product; the 50-baht
// minimum KGI may restore if e-statements bounce three times; adviser rates.
//
//   node brokers/kgithailand/kgithailand_cost.mjs PTT "Stock Exchange of Thailand" THB --shares=1000 --price=33
//   node brokers/kgithailand/kgithailand_cost.mjs 1DIV SET THB --shares=2500 --price=13
//   node brokers/kgithailand/kgithailand_cost.mjs AAPL80 SET THB --shares=3000 --price=11
//   node brokers/kgithailand/kgithailand_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { makeSetCost, printSetCli } from "./setCost.mjs";

const READ_ON = "2026-10-26";

export const SCALE = [
  { upTo: 5e6, rate: 0.0015 },
  { upTo: 10e6, rate: 0.0013 },
  { upTo: 20e6, rate: 0.0011 },
  { upTo: Infinity, rate: 0.001 },
];

export const roundTrip = makeSetCost({
  folder: "kgithailand",
  name: "KGI Securities Thailand",
  catalogue: new URL("kgithailand-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.kgieworld.co.th/corporate/media/pdf/feerate/eq-commission-th.pdf",
    page: "https://www.kgieworld.co.th/corporate/investment/feerate",
    readOn: READ_ON,
    entity: "KGI Securities (Thailand) PCL",
    account: "internet, Cash Balance & Credit Balance",
  },
  scale: SCALE,
  min: 0,
  basis:
    `barème KGI Thailand du 7 mars 2025 relu le ${READ_ON} : internet, compte Cash Balance, 0,150 % jusqu'à 5 M THB par jour, ` +
    `0,130 % jusqu'à 10 M, 0,110 % jusqu'à 20 M, 0,100 % au-delà, TVA 7 % en sus, sans minimum (relevé électronique)`,
});

printSetCli(roundTrip, import.meta.url);
