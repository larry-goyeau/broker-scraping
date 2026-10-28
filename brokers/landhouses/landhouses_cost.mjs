// What one round trip costs at Land and Houses Securities PCL (LH
// Securities): buy n shares at price p on the Stock Exchange of Thailand
// (SET / mai) over the internet, sell them back, in dollars. Every
// catalogue line is a baht SET line.
//
// Tariff read 2026-10-26 (no login; the page loads its text from
// https://www.lhsec.co.th/ajax/about_detail.php, id 52):
//   https://www.lhsec.co.th/infocus.php?method=detail&id=52
//   "มูลค่าการซื้อขาย/ วัน/ บัญชีซื้อขายหลักทรัพย์ (บาท)", internet, "บัญชี
//   แคชบาลานซ์ (Cash Balance) / บัญชีเครดิตบาลานซ์ (Credit Balance)":
//     ≤ 5 ล้าน 0.15 %, 5–10 ล้าน 0.13 %, 10–20 ล้าน 0.11 %, 20 ล้านขึ้นไป 0.10 %
//   plus Trading Fee 0.005 % (SET), Clearing Fee 0.001 % (TSD), Regulatory
//   Fee 0.001 % (SEC), "ภาษีมูลค่าเพิ่ม 7% ของค่าธรรมเนียมทั้งหมด"
//   "ค่าธรรมเนียมขั้นต่ำ 30 บาทต่อวัน (ไม่รวมค่าธรรมเนียม 0.007% และภาษี
//   มูลค่าเพิ่ม 7%)"
//   Note: units (funds, ETF, property funds) pay the same stepped scale as
//   shares ("เป็นลักษณะขั้นบันไดเช่นเดียวกับหลักทรัพย์ประเภทหุ้น").
//
// Formula, each side: max(scale on the day's value, 30 baht) × 1.07
// + 0.007 % × 1.07; both sides + the SET book (../kgithailand/setCost.mjs).
//
// Priced account: Cash Balance, funded in full before trading (id 53).
// Left out: the Cash account (internet 0.20 %) needs a credit line approved
// on financial proof and 20 % collateral; bond-fund units at a negotiated
// rate (none in the catalogue); Shares Saving Plan and EJIP; marketing-
// officer rates.
//
//   node brokers/landhouses/landhouses_cost.mjs PTT "Stock Exchange of Thailand" THB --shares=1000 --price=33
//   node brokers/landhouses/landhouses_cost.mjs 1DIV SET THB --shares=2500 --price=13
//   node brokers/landhouses/landhouses_cost.mjs CPALL SET THB --shares=100 --price=50
//   node brokers/landhouses/landhouses_cost.mjs --schedule
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
export const MIN = 30;

export const roundTrip = makeSetCost({
  folder: "landhouses",
  name: "Land and Houses Securities",
  catalogue: new URL("landhouses-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.lhsec.co.th/infocus.php?method=detail&id=52",
    accounts: "https://www.lhsec.co.th/infocus.php?method=detail&id=53",
    readOn: READ_ON,
    entity: "Land and Houses Securities PCL",
    account: "internet, Cash Balance / Credit Balance",
  },
  scale: SCALE,
  min: MIN,
  basis:
    `barème LH Securities relu le ${READ_ON} : internet, compte Cash Balance, 0,15 % jusqu'à 5 M THB par jour, ` +
    `0,13 % jusqu'à 10 M, 0,11 % jusqu'à 20 M, 0,10 % au-delà, minimum ${MIN} THB par jour, TVA 7 % en sus`,
});

printSetCli(roundTrip, import.meta.url);
