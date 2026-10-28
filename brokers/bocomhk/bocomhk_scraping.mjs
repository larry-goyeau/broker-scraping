// What Bank of Communications (Hong Kong) Limited (交通銀行(香港)) sells
// online in shares and ETFs, with no login: Hong Kong securities, Shanghai
// and Shenzhen A-shares through Northbound Stock Connect, and US stocks.
// The bank publishes no list for any of them.
//
// Hong Kong: the securities fee schedule (effective 19 October 2026) prices
// "本地證券" for "電子交易途徑 (網上/音頻電話/證券流動應用程式)": 0.20% of
// the amount, minimum HK$/RMB100. No page names a board or kind of HKEX
// security that is not traded, so the catalogue is HKEX's whole book of
// shares, REITs and ETPs (../primehk/hkexBook.mjs), HKD, USD and RMB
// counters as their own codes ("設有人民幣計價證券服務").
//
// Stock Connect: the Stock Connect page says "本行提供滬股通/深股通股票服務"
// and "透過證券交易專線服務員、網上銀行證券及證券流動應用程式，直接買賣滬股通/
// 深股通證券"; the fee schedule prices "滬股通/深股通證券" for "電子交易途徑
// (只適用於網上)" at 0.20%, minimum RMB100, with separate stock and ETF
// levies. The list is HKEX's Northbound buy-and-sell lists
// (./connectBook.mjs). The FAQ: "科創板股票僅限機構專業投資者買賣" and
// "創業板股票僅限機構專業投資者買賣" (the Stock Connect rule, a property of
// the client): STAR Market and ChiNext shares stay, with a remark.
//
// United States: the US stock service page says "透過交通銀行(香港)線上美股
// 服務，閣下可參與美國主要交易所上市的股票買賣", trading channels "交通銀行
// (香港)證券應用流動程式" and "網上銀行", and "可供買賣的證券覆蓋美國主流的
// 交易所：紐約證券交易所、納斯達克證券交易所、美國證券交易所". It names
// three exchanges and no other (owner rule: a country place keeps only the
// venues the broker names), so the US rows are the lines of
// ../wellstrade/usBook.mjs whose primary listing is NYSE (XNYS), Nasdaq
// (XNAS) or NYSE American (XASE); NYSE Arca, Cboe BZX and Texas listings
// (most ETFs) are left out. The US fee schedule prices "電子途徑佣金" at
// US$0.013 a share, minimum US$13. It also prices a "非美國DTC結算費" for
// "美國場外市場交易證券", but no page says OTC securities are sold online, so
// none are added. broker-list.json names the same places (HKEX, SSE, SZSE,
// both Connects, NYSE, Nasdaq, NYSE American).
//
// Left out: the fee schedule prices "新加坡證券" (1%, minimum US$50) with no
// online channel and no page offers them online; "本地上市之美國證券" are
// the HKEX-listed US lines already in the HKEX book.
//
//   https://www.hk.bankcomm.com/hk/shtml/hk/tw/2004980/2005004/2008353/list.shtml?channelId=2004980
//   https://www.hk.bankcomm.com/hk/shtml/hk/tw/2004980/2005004/2008355/list.shtml?channelId=2004980
//   https://www.hk.bankcomm.com/hk/shtml/hk/tw/2004980/2005004/2008355/2503715.shtml?channelId=2004980
//   https://www.hk.bankcomm.com/hk/shtml/hk/tw/2004980/2005004/5005300/9040415.shtml?channelId=2004980
//
// Fees (收費表 → 證券買賣服務, 證券買賣服務(美股)):
//   https://www.hk.bankcomm.com/hk/shtml/hk/tw/2005223/2005225/list.shtml?channelId=2005223
//   https://www.hk.bankcomm.com/hk/fileDownload.html?fileId=4029c74b1108451d98123cd7f76c393f
//   https://www.hk.bankcomm.com/hk/fileDownload.html?fileId=d3384363875a471299a6493fd9fe007d
//
//   node brokers/bocomhk/bocomhk_scraping.mjs

import { evidence, hkCatalogue } from "./hkCatalogue.mjs";

const SITE = "https://www.hk.bankcomm.com/hk/shtml/hk/tw";

await evidence(`${SITE}/2004980/2005004/5005300/9040415.shtml?channelId=2004980`, [
  /可供買賣的證券覆蓋美國主流的交易所\s*紐約證券交易所\s*納斯達克證券交易所\s*美國證券交易所\s*結算貨幣/,
  /網上銀行/,
]);
await evidence(`${SITE}/2004980/2005004/2008355/2503715.shtml?channelId=2004980`, [
  /科創板股票僅限機構專業投資者買賣/,
  /創業板股票僅限機構專業投資者買賣/,
]);
await evidence(`${SITE}/2005223/2005225/list.shtml?channelId=2005223`, [/證券買賣服務\(美股\)/]);

await hkCatalogue({
  folder: "bocomhk",
  connect: { STAR: "remark", ChiNext: "remark" },
  us: { mics: ["XNYS", "XNAS", "XASE"] },
  least: { HKEX: 2500, connect: 3500, US: 6000 },
});
