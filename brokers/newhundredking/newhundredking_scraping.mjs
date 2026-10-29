// What New Hundred King Securities (新百王證券, Kaohsiung) sells in shares and
// ETFs, with no login. It is a domestic electronic broker ("低手續費電子券商
// 24hr證券線上開戶"): accounts are opened online, orders are placed in its
// web and app platforms (雲端致富網, 新百王雲端行動下單), and its FAQ prices
// Taiwan stocks only, Q4 "買賣台股時的電子下單手續費怎麼算? ... 手續費：為股票
// 成交金額的0.1425%，再乘上券商給予的折數。如該費率計算手續費未滿新台幣20元，
// 按新台幣20元計收。" It prints no security list and offers no sub-brokerage
// of foreign shares, so the catalogue is every share, preferred share, TDR,
// REIT and ETF listed on the Taiwan Stock Exchange and the Taipei Exchange
// (its two places in broker-list.json), read by ../banktaiwan/twBook.mjs.
// The emerging board (興櫃) is not named and stays out. Settlement is
// through the 百ONE錢包 sub-account tied to a client's bank account in TWD,
// so the foreign-currency lines of the dual-currency ETFs stay out.
//
//   https://www.nhks.com.tw/%e5%b8%b8%e8%a6%8b%e5%95%8f%e9%a1%8c/   (FAQ)
//
// Fees: 0.1425% times the broker's discount, minimum NT$20 (FAQ Q4).
//
//   node brokers/newhundredking/newhundredking_scraping.mjs

import { writeTwBook } from "../banktaiwan/twBook.mjs";

const FAQ = "https://www.nhks.com.tw/%e5%b8%b8%e8%a6%8b%e5%95%8f%e9%a1%8c/";

await writeTwBook({
  broker: "New Hundred King Securities",
  out: new URL("newhundredking-parsed.json", import.meta.url),
  evidence: [
    { url: FAQ, pattern: /買賣台股時的電子下單手續費怎麼算/ },
    { url: FAQ, pattern: /手續費：為股票成交金額的0\.1425%，再乘上券商給予的折數。如該費率計算手續費未滿新台幣20元，按新台幣20元計收/ },
  ],
});
