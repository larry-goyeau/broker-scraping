// What SBI Neotrade Securities (SBIネオトレード証券) sells, with no login.
//
// The cash-trading outline names the book by category and lists what is
// not handled:
//   取扱商品: "東京証券取引所（プライム・スタンダード・グロース）",
//   "ETF （上場投資信託） ※外国籍を除く", REIT, ETN, 優先出資証券,
//   venture, country and infrastructure funds.
//   "以下の銘柄はお取扱しておりません。 上記市場以外の地方単独上場銘柄
//   （名証など） 外国株式 外国籍ETF 証券保管振替機構非取扱銘柄 TOKYO PRO
//   Market TOKYO PRO-BOND Market"
// Tokyo is the only place.
//
// So the book is the JPX month-end file read by ../tachibana/wholeTokyo.mjs:
// domestic Prime, Standard and Growth shares and 出資証券 (優先出資証券),
// every ETN, and every ETF except a foreign-domiciled one: a fund whose
// manager on the JPX ETF list is a foreign company (WisdomTree Management
// Jersey, State Street, World Gold Trust). Tokyo-listed foreign shares,
// PRO Market and the JASDEC non-handled code are out. REIT and the closed
// funds are none of STOCK/ETF/ETC/ETN and stay out.
//
// The page adds "※当社の判断により、上記以外にお取引を制限させていただく
// 銘柄がございます。" with no list, so a few rows may be names it refuses.
//
//   https://www.sbineotrade.jp/stock/outline/
//   https://www.sbineotrade.jp/stock/fee/  (fees)
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/sbineotrade/sbineotrade_scraping.mjs

import { buildWholeJapan, requireSentences } from "../tachibana/wholeTokyo.mjs";

await buildWholeJapan({
  folderUrl: import.meta.url,
  file: "sbineotrade-parsed.json",
  foreignShares: false,
  foreignEtfs: false,
  nagoya: false,
  checks: [
    requireSentences("https://www.sbineotrade.jp/stock/outline/", [
      "東京証券取引所（プライム・スタンダード・グロース）",
      "ETF （上場投資信託） ※外国籍を除く",
      "以下の銘柄はお取扱しておりません。",
      "外国株式 外国籍ETF 証券保管振替機構非取扱銘柄 TOKYO PRO Market",
    ]),
  ],
});
