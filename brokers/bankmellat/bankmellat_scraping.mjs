// What Bank Mellat Brokerage (کارگزاری بانک ملت) sells in shares and ETFs,
// with no login. It is "کارگزار رسمی بورس اوراق بهادار تهران – فرابورس – بورس
// کالا و بورس انرژی" (every page footer), and its online systems (Online
// Plus "سامانه معاملات برخط آنلاین پلاس", Hamrah Plus, Kaman) trade the
// TSE and IFB books.
//
//   https://www.mellatbroker.ir/
//   https://www.mellatbroker.ir/راهنمای-سامانه-های-معاملاتی
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row (the IME and energy exchanges are commodities, not shares/ETFs).
//
// Mellat publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fee page "نرخ و کارمزد معاملات": "کارمزد معاملات آنلاین با معاملات عادی
// هیچگونه تفاوتی ندارد", with the SEO share table as an image
// (upload/files/filemanager/1723621658722.jpg): buy 0.003712 / sell 0.0088
// (broker 0.304% each side, sell tax 0.5%), one table for TSE and IFB, no
// ETF rows.
//
//   https://www.mellatbroker.ir/نرخ-و-کارمزد-معاملات
//
//   node brokers/bankmellat/bankmellat_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("bankmellat-parsed.json", import.meta.url);
const FEES = "https://www.mellatbroker.ir/نرخ-و-کارمزد-معاملات";
const ONLINE = "https://www.mellatbroker.ir/راهنمای-سامانه-های-معاملاتی";
const HOME = "https://www.mellatbroker.ir/";

await Promise.all([
  iranPageSays(FEES, [/کارمزد معاملات آنلاین با معاملات عادی هیچگونه تفاوتی ندارد/]),
  iranPageSays(FEES, [/1723621658722\.jpg/], { raw: true }),
  iranPageSays(ONLINE, [/سامانه معاملات برخط/]),
  iranPageSays(HOME, [/کارگزار رسمی بورس اوراق بهادار تهران/, /فرابورس/]),
]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Bank Mellat Brokerage: ${iranBookSummary(rows)}`);
