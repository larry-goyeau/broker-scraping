// Luso International Bank (澳門國際銀行, Macau) sells shares online through
// its itrade web platform and app, on two places:
//
// - Hong Kong: the bank's stock-trading page offers "網上股票買賣平台
//   (itrade)、手機APPS", and its fee schedule prices Hong Kong trades online
//   (網上理財). No list and no exception is given, so the place is the whole
//   HKEX book (../primehk/hkexBook.mjs through ../bocomhk/hkCatalogue.mjs:
//   shares, REITs and exchange-traded products; HKD, USD and RMB counters
//   each on their own code; suspended and never-traded lines left out).
//     https://www.lusobank.com.mo/libtc/tzlc/gpmm/gpmm/index.shtml
//
// - United States: the itrade FAQ, "澳門國際銀行提供網上美股交易服務，客戶可
//   透過網上交易平台或手機證券 APP 買賣在紐約證券交易所（ NYSE ）、納斯達克證券
//   交易所（ NASDAQ ）等美國證券交易所上市的股票". "等" (and others) opens the
//   whole country, and "all shares" includes the exchanges' ETFs, so the
//   place is the whole US exchange book (../wellstrade/usBook.mjs, one NBBO
//   row per title on its primary listing). Only the regular session is
//   traded; OTC is not offered.
//     https://itrade.lusobank.com.mo/info/zh_TW/load/FAQ.html
//
// Fees: "股票服務收費表" (itrade, updated 2026-10-01): Hong Kong online
// commission 0.168%, minimum HKD 68 (0.099% min. HKD 50 for the first three
// months of a new account); US commission USD 0.05 a share, minimum USD 12,
// plus USD 2 a buy order (USD 0.015 a share, min. USD 2.8, "until further
// notice"). The PDF's Chinese text is in an embedded CID font that Node
// cannot read, so the run checks only that the schedule is still served
// and still linked from the bank's stock-trading page.
//   https://itrade.lusobank.com.mo/info/zh_TW/FAQ.file/Commission%20and%20Fees%20Schedule.pdf
//
//   node brokers/luso/luso_scraping.mjs

import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";
import { pageSays, pdfSays } from "../alphasec/pdfSays.mjs";

const SCHEDULE = "https://itrade.lusobank.com.mo/info/zh_TW/FAQ.file/Commission%20and%20Fees%20Schedule.pdf";

await pageSays("https://www.lusobank.com.mo/libtc/tzlc/gpmm/gpmm/index.shtml", [
  /網上股票買賣平台\(itrade\)/,
  /FAQ\.file\/Commission(?: |%20)and(?: |%20)Fees(?: |%20)Schedule\.pdf/,
], { raw: true });
await pdfSays(SCHEDULE, []);
await evidence("https://itrade.lusobank.com.mo/info/zh_TW/load/FAQ.html", [
  /買賣在紐約證券交易所（ ?NYSE ?）、納斯達克證券交易所（ ?NASDAQ ?）等美國證券交易所上市的股票/,
]);

await hkCatalogue({ folder: "luso", us: { mics: null }, least: { HKEX: 2500, US: 10000 } });
