// What Kuang Ho Securities (光和證券) sells in shares and ETFs, with no
// login. It is a domestic broker with its own online order platforms (光和
// e點贏 app and desktop, with "智慧下單" conditional orders), and its
// pages offer the Taiwan market only (no sub-brokerage of foreign shares;
// it also sells TPEx gold spot, which is not a share). It prints no
// security list, so the catalogue is every share, preferred share, TDR,
// REIT and ETF listed on the Taiwan Stock Exchange and the Taipei Exchange
// (its two places in broker-list.json), read by ../banktaiwan/twBook.mjs.
// Its news page says Taiwan Innovation Board shares may be day-traded
// ("創新板上市股票自114年11月17日起得為當日沖銷交易標的"): they stay in. The
// emerging board (興櫃) is not named and stays out; the foreign-currency
// lines of the dual-currency ETFs stay out (TWD settlement).
//
//   https://www.kuanzho.com.tw/index_tw.php
//   https://event.kuanzho.com.tw/%E5%85%89%E5%92%8Ce%E9%BB%9E%E8%B4%8F%E6%99%BA%E6%85%A7%E4%B8%8B%E5%96%AE.html
//
// Fees: the broker's own investor-education page on trading costs (dated
// 2026-10-28): "標準費率是成交金額的 0.1425%，買進、賣出都要收。多數券商有折扣
// 方案，折數和最低手續費各家不同，實際以你的帳戶方案為準"; it publishes no
// discount of its own, so the cost file takes the ceiling 0.1425%.
//   https://www.kuanzho.com.tw/newsdetail_tw.php?id=7379
//
//   node brokers/kuangho/kuangho_scraping.mjs

import { writeTwBook } from "../banktaiwan/twBook.mjs";

await writeTwBook({
  broker: "Kuang Ho Securities",
  out: new URL("kuangho-parsed.json", import.meta.url),
  evidence: [
    { url: "https://www.kuanzho.com.tw/newsdetail_tw.php?id=7379", pattern: /標準費率是成交金額的 ?0\.1425%/ },
    { url: "https://www.kuanzho.com.tw/index_tw.php", pattern: /光和e點贏/ },
  ],
});
