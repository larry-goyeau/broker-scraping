// What Rahin Brokerage (کارگزاری راهین) sells in shares and ETFs, with no
// login. Its home page lists "سامانه معاملات برخط آنلاین پلاس", Kaman and
// Hamrah Plus, Tadbir's online systems for the TSE and IFB books.
//
//   https://rahinbrokerage.ir/
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row. The fee page covers the TSE only; the site links the IFB and excludes
// neither exchange.
//
// Rahin publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fees: page "کارمزد معاملات بورس": retail shares buy 0.003712 / sell 0.0088
// (broker 0.304% each side, sell tax 0.5%), "جمع کل 0.003712 0.0088
// 0.012512"; no IFB or ETF rows.
//
//   https://rahinbrokerage.ir/newPage?pagepath=p104
//
//   node brokers/rahin/rahin_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("rahin-parsed.json", import.meta.url);
const FEES = "https://rahinbrokerage.ir/newPage?pagepath=p104";
const HOME = "https://rahinbrokerage.ir/";

await Promise.all([
  iranPageSays(FEES, [/جمع کل 0\.003712 0\.0088 0\.012512/]),
  iranPageSays(HOME, [/سامانه معاملات برخط آنلاین پلاس/]),
]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Rahin Brokerage: ${iranBookSummary(rows)}`);
