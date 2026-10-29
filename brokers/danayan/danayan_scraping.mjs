// What Danayan Brokerage (کارگزاری دانایان) sells in shares and ETFs, with
// no login. The Danayan group site says its brokerage trades the capital
// market's securities through its own OMS: "این خدمت از گروه دانایان با OMS
// جدید و اختصاصی خود (دانایان تریدر)".
//
//   https://danayan.com/financial-services/
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row; the group's fee article gives a rate for each ("کارمزد خرید سهام
// فرابورسی 0.3632 درصد").
//
// Danayan publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fees: the brokerage-fee article on danayan.academy, the group's academy
// (linked from danayan.com's pages; the brokerage's own danayan.broker does
// not answer from abroad): TSE shares buy 0.3712% / sell 0.88%, IFB shares
// 0.3632% / 0.88%, ETFs 0.116% / 0.11875% (article of 2022, revised May 2024).
//
//   https://danayan.academy/blog/15255/stock-brokerage-fee/
//
//   node brokers/danayan/danayan_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("danayan-parsed.json", import.meta.url);
const FEES = "https://danayan.academy/blog/15255/stock-brokerage-fee/";
const ONLINE = "https://danayan.com/financial-services/";

await Promise.all([
  iranPageSays(FEES, [/0\.3712/, /کارمزد خرید سهام فرابورسی 0\.3632 درصد/]),
  iranPageSays(ONLINE, [/دانایان تریدر/]),
]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Danayan Brokerage: ${iranBookSummary(rows)}`);
