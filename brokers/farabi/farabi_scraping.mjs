// What Farabi Brokerage (کارگزاری فارابی) sells in shares and ETFs, with no
// login. Its online platforms (Farabixo, Next) trade the Tehran Stock
// Exchange and Iran Fara Bourse: "سفارش خرید خود را در سامانه معاملات آنلاین
// کارگزاری فارابی ثبت کنید", and its fee table has one column for بورس (TSE)
// and one for فرابورس (IFB), shares and ETFs (ETF در سهام, ETF مختلط, ETF ثابت).
//
//   https://help.irfarabi.com/راهنمای-خرید-اوراق-سلف-موازی-استاندار/اخبار/
//   https://help.irfarabi.com/کارمزد-معاملات/اطلاعات-عمومی/
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row. The commodity (IME) and energy exchanges, options, bonds and
// commodity certificates it also trades are not shares or ETFs.
//
// Farabi publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fee page (SEO-approved rates, "در جدول زیر کارمزد مصوب سازمان قابل بررسی
// است"): shares buy 0.003712 (TSE) / 0.003632 (IFB), sell 0.0088; equity ETF
// 0.002245 / 0.0023; mixed ETF 0.001175 / 0.0012625; fixed-income ETF
// 0.000369 each side (help.irfarabi.com, updated 16 Tir 1405).
//
//   node brokers/farabi/farabi_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "./iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("farabi-parsed.json", import.meta.url);
const FEES = "https://help.irfarabi.com/کارمزد-معاملات/اطلاعات-عمومی/";
const ONLINE = "https://help.irfarabi.com/راهنمای-خرید-اوراق-سلف-موازی-استاندار/اخبار/";

await Promise.all([
  iranPageSays(FEES, [/سمت بورس فرابورس ETF در سهام/, /خرید 0\.003712 0\.003632/]),
  iranPageSays(ONLINE, [/سامانه معاملات آنلاین کارگزاری فارابی/]),
]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Farabi Brokerage: ${iranBookSummary(rows)}`);
