// What Arman Tadbir Naqsh Jahan Brokerage (کارگزاری آرمان تدبیر نقش جهان)
// sells in shares and ETFs, with no login. Its home page offers "پلتفرم
// معاملاتی کمان، سامانه معاملاتی سیلور، سامانه معاملاتی آفلاین" (Kaman, Silver
// = Tadbir Online Plus), which trade the TSE and IFB books.
//
//   https://armanbroker.ir/
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row; its fee article has a table for each.
//
// Arman publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fees: the academy article "کارمزد و مالیات خرید و فروش بورس" (February
// 2025): shares buy 0.003712 / sell 0.0088 (TSE table), IFB 0.003632 /
// 0.0088 (table image), equity ETFs 0.00116 / 0.0011875, gold funds 0.00125.
//
//   https://armanbroker.ir/academy/کارمزد-و-مالیات-خرید-و-فروش-بورس/
//
//   node brokers/armantadbir/armantadbir_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("armantadbir-parsed.json", import.meta.url);
const FEES = "https://armanbroker.ir/academy/کارمزد-و-مالیات-خرید-و-فروش-بورس/";
const HOME = "https://armanbroker.ir/";

await Promise.all([
  iranPageSays(FEES, [/کارمزد خرید: به ازای هر سهمی که خریداری می کنید، 0\.003712/, /0\.0088/]),
  iranPageSays(HOME, [/سامانه معاملاتی سیلور/]),
]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Arman Tadbir Naqsh Jahan Brokerage: ${iranBookSummary(rows)}`);
