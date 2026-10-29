// What Parsian Brokerage (کارگزاری پارسیان) sells in shares and ETFs, with
// no login. Its online systems (Patris, Exir, the mobile app) are presented
// under the menu "اوراق بهادار و فرابورس": "کارگزاری پارسیان مجموعه ای از نرم
// افزار و سامانه های مختلف را برای مشتریان آنلاین خود در نظر گرفته است".
//
//   https://www.parsianbroker.com/اوراق-بهادار-و-فرابورس/معاملات-برخط-یا-انلاین/معرفی-معاملات-انلاین
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row; the fee schedule has a TSE table and an IFB table (first, second,
// third and base markets) plus an ETF table.
//
// Parsian publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out. Its online rules ("محدودیت های ماده 10 معاملات آنلاین") bar
// online clients from block trades ("معامله عمده"), which are not rows here.
// Remark, not removal: the online rules page lists the IFB base-market risk
// statement ("بیانیه پذیرش ریسک بازار پایه فرابورس"), signed before a base-
// market buy.
//
//   https://www.parsianbroker.com/اوراق-بهادار-و-فرابورس/معاملات-برخط-یا-انلاین/قوانین-و-مقررات-معاملات-برخط
//
// Fees: the header link "نرخ کارمزدها" opens a PDF schedule on the broker's
// site. It is the February 2018 table (TSE shares buy 0.464% / sell 0.975%
// with the broker's 0.38% each side; IFB 0.454% / 0.975%; ETFs 0.464% /
// 0.475%), older than today's SEO rates (0.3712% / 0.88%).
//
//   https://www.parsianbroker.com/getmedia/032a75ab-40b2-4ca7-bcc7-1cab9775d673/کارمزد-جدید
//
//   node brokers/parsian/parsian_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("parsian-parsed.json", import.meta.url);
const HOME = "https://www.parsianbroker.com/";
const FEES = "https://www.parsianbroker.com/getmedia/032a75ab-40b2-4ca7-bcc7-1cab9775d673/کارمزد-جدید";
const ONLINE = "https://www.parsianbroker.com/اوراق-بهادار-و-فرابورس/معاملات-برخط-یا-انلاین/معرفی-معاملات-انلاین";
const RULES = "https://www.parsianbroker.com/اوراق-بهادار-و-فرابورس/معاملات-برخط-یا-انلاین/قوانین-و-مقررات-معاملات-برخط";
const BASE_REMARK = "Iran Fara Bourse base market: Parsian's online rules list the base-market risk statement (بیانیه پذیرش ریسک بازار پایه فرابورس), signed before a buy.";

await Promise.all([
  iranPageSays(HOME, [/نرخ کارمزدها/]),
  iranPageSays(FEES, [], { pdf: true }),
  iranPageSays(ONLINE, [/سامانه معاملات برخط کارگزاری پارسیان/]),
  iranPageSays(RULES, [/بیانیه پذیرش ریسک بازار پایه فرابورس/, /محدودیت های ماده 10 معاملات آنلاین/]),
]);

const rows = await iranBook();
for (const row of rows) if (row.mic === "IFBX" && /بازار پایه/.test(row.raw)) row.remark = BASE_REMARK;
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Parsian Brokerage: ${iranBookSummary(rows)}; ${rows.filter((r) => r.remark).length} base-market remarks`);
