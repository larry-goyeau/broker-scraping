// China Construction Bank (Macau) (中國建設銀行澳門分行) sells securities to
// its clients "透過互聯網或電話" (internet banking or phone), with "透過網上
// 銀行交易，專享劃一0.18%買賣佣金，不設最低買賣金額" (securities-trading page).
// Places:
//
// - Hong Kong: no list and no exception (its FAQ treats Hong Kong shares,
//   CBBCs and stop-loss orders), so the whole HKEX book
//   (../primehk/hkexBook.mjs through ../bocomhk/hkCatalogue.mjs: shares,
//   REITs and exchange-traded products; HKD, USD and RMB counters each on
//   their own code; suspended and never-traded lines left out).
//
// - Shanghai through Stock Connect: the investment FAQ says orders entered
//   out of hours wait for the next session, "但是滬股通交易只可於上海市場交易
//   時段内落盤" (Shanghai Connect orders only in Shanghai trading hours), so
//   Northbound Shanghai trading is offered through the same channels. The
//   book is HKEX's Northbound buy-and-sell list of SSE securities
//   (../welllink/connectBook.mjs), A-shares and ETFs, in CNH. Shenzhen
//   Connect is never named on the bank's pages and stays out.
//   broker-list.json: "Northbound-eligible A-shares and ETFs only; STAR
//   Market for institutional professional investors only". The first half
//   is the eligible list itself. The second is a property of the client,
//   so STAR Market (688/689) lines stay with the BOARD_REMARK of
//   ../bocomhk/hkCatalogue.mjs.
//
//   https://www.asia.ccb.com/macau_tc/personal/investment/securities_trading.html
//   https://www.asia.ccb.com/macau_tc/personal/faq/investment/faq.html
//
// Fees: online "劃一0.18%買賣佣金，不設最低買賣金額" (same page).
//
//   node brokers/ccbmo/ccbmo_scraping.mjs

import { hkCatalogue } from "../bocomhk/hkCatalogue.mjs";
import { pageSays } from "../alphasec/pdfSays.mjs";

await pageSays("https://www.asia.ccb.com/macau_tc/personal/investment/securities_trading.html", [
  /透過網上銀行交易，專享劃一0\.18%買賣佣金，不設最低買賣金額/,
], { raw: true });
const faq = await pageSays("https://www.asia.ccb.com/macau_tc/personal/faq/investment/faq.html", [/滬股通交易只可於上海市場交易時段内落盤/], { raw: true });
if (/深股通|深港通/.test(faq)) throw new Error("the FAQ now names Shenzhen Connect: read it");

await hkCatalogue({
  folder: "ccbmo",
  connect: { STAR: "remark", ChiNext: "remark" },
  drop: (row) => (row.mic === "XSHE" ? "Shenzhen Connect (not offered)" : ""),
  least: { HKEX: 2500, connect: 500 },
});
