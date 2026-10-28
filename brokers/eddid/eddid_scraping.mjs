// What Eddid Securities and Futures (艾德證券期貨, Hong Kong) sells online
// in shares and ETFs, with no login: Hong Kong and US stocks in the Eddid
// ONE app and web platform. It publishes no list of titles.
//
// Fees (收費標準): Hong Kong "港股交易標準收費（股票、ETF、窩輪及牛熊證）",
// "佣金(經網上或手機應用程式落盤) 交易金額 × 0.028%", minimum HK$8, plus a
// HK$12 platform fee; US "美股交易標準收費（不包括 OTC Market）", "佣金（經網上或
// 手機應用程式落盤） 0.0049美元/股", minimum US$0.99.
//
// Hong Kong is HKEX's whole book of shares, REITs and ETPs
// (../primehk/hkexBook.mjs). The charges page: "鑑於香港交易所於2023年6月19日
// 推出港幣-人民幣雙櫃檯模式，在雙幣安排下進行的所有交易，其相關費用和佣金
// （包括平台費）將以交易貨幣計算", so the RMB counters stay, each on its own
// code with its trading currency, as do the USD ones.
//
// The US is the exchange book of the day (../wellstrade/usBook.mjs; one
// NBBO row per title). The US FAQ says "目前Eddid ONE支援的交易品種主要有：
// 正股、ETF、ETN、債券等" and describes NYSE, NASDAQ, AMEX, pink sheets and
// OTC as the US markets, naming no exchange it leaves out; the exception
// the broker names is OTC ("不包括 OTC Market"), and OTC lines are not in
// usBook, so none is added.
//
// broker-list.json also lists the Tokyo Stock Exchange and SGX "By phone
// only"; this catalogue is what a client trades online, so they are not in
// it.
//
//   https://www.eddid.com.hk/sf/hk-stock-faq/
//   https://www.eddid.com.hk/sf/us_stock_faq/
//
// Fees: https://www.eddid.com.hk/sf/charges/
//
//   node brokers/eddid/eddid_scraping.mjs

import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";

await evidence("https://www.eddid.com.hk/sf/charges/", [
  /佣金\(經網上或手機應用程式落盤\) 交易金額 × 0\.028%/,
  /美股交易標準收費（不包括 OTC Market）/,
  /佣金（經網上或手機應用程式落盤） 0\.0049美元\/股/,
  /雙櫃檯模式/,
]);
await evidence("https://www.eddid.com.hk/sf/us_stock_faq/", [/目前Eddid ONE支援的交易品種主要有：正股、ETF、ETN、債券等/]);

await hkCatalogue({
  folder: "eddid",
  us: { mics: null },
  least: { HKEX: 2500, US: 10000 },
});
