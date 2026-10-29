// What Melal Pouya Brokerage (کارگزاری ملل پویا) sells in shares and ETFs,
// with no login. Its home page lists its online systems: "سامانه معاملاتی
// ملل تریدر", Tadbir Online Plus and an internet (offline) order system,
// which trade the TSE and IFB books; its bond page introduces both
// exchanges.
//
//   https://melalsecurities.ir/
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row.
//
// Melal publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fees: the broker's FAQ post (May 2020): "کارمزد کارگزاری ها برای معاملات
// سهام برابر است با 0.0038 برای خرید و 0.0038 برای فروش", the broker's own
// 0.38% each side of that time, without the exchange charges and the 0.5%
// sell tax; no ETF rate. The only share rate on its site, and older than
// today's SEO table (0.3712% / 0.88% all in).
//
//   https://melalsecurities.ir/blog/2020/05/1084
//
//   node brokers/melal/melal_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("melal-parsed.json", import.meta.url);
const FEES = "https://melalsecurities.ir/blog/2020/05/1084";
const HOME = "https://melalsecurities.ir/";

await Promise.all([
  iranPageSays(FEES, [/کارمزد کارگزاری ها برای معاملات سهام برابر است با 0\.0038 برای خرید/]),
  iranPageSays(HOME, [/ملل تریدر/]),
]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Melal Pouya Brokerage: ${iranBookSummary(rows)}`);
