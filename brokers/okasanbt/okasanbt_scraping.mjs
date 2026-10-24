// What Okasan Business & Technology Securities (岡三ビジネス＆テクノロジー
// 証券) sells online, with no login.
//
// The product table marks, for ネット取引, the Tokyo market (東京市場 ○),
// preferred shares and listed funds (上場投資信託(ETF・REIT) ○), and marks
// Nagoya, Fukuoka, Sapporo, US and Chinese shares × online: those are
// face-to-face only, now through 証券ジャパンウェルスマネジメント, and Hong
// Kong is not in the table. The order rules give the online scope:
//   "ネット取引の取扱市場は以下の通りです。（現物・信用） 東京証券取引所
//   プライム 、 スタンダード 、 グロース ※証券保管振替機構の非同意銘柄、
//   カントリーファンドのお取扱いはございません。"
// and read ETF, REIT and ETN orders in units. Tokyo is the only online
// place, so the places broker-list.json adds (NYSE, Nasdaq, Hong Kong,
// Nagoya, Fukuoka, Sapporo) are not in this file.
//
// So the book is the JPX month-end file read by ../tachibana/wholeTokyo.mjs:
// Prime, Standard and Growth shares, domestic and foreign (the rule names
// the segments, not only domestic issuers), 出資証券, and every ETF and
// ETN. The JASDEC non-handled code and PRO Market are out. Country funds
// sit in the REIT/fund section, which stays out like in the other
// Japanese files (none of STOCK/ETF/ETC/ETN). The firm's own trading
// restrictions are shown only inside the trading screen.
//
// www.secjp.co.jp is a CNAME whose target has no trailing dot; the check
// below retries through a public resolver when the local one fails.
//
//   https://www.secjp.co.jp/service/comparison/
//   https://www.secjp.co.jp/service/net/rule/about/
//   https://www.secjp.co.jp/service/commission/net/  (fees)
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/okasanbt/okasanbt_scraping.mjs

import { buildWholeJapan, requireSentences } from "../tachibana/wholeTokyo.mjs";

await buildWholeJapan({
  folderUrl: import.meta.url,
  file: "okasanbt-parsed.json",
  foreignShares: true,
  foreignEtfs: true,
  nagoya: false,
  checks: [
    requireSentences("https://www.secjp.co.jp/service/net/rule/about/", [
      "ネット取引の取扱市場は以下の通りです。（現物・信用） 東京証券取引所 プライム 、 スタンダード 、 グロース",
      "※証券保管振替機構の非同意銘柄、カントリーファンドのお取扱いはございません。",
    ]),
    requireSentences("https://www.secjp.co.jp/service/comparison/", [
      "東京市場 ○ ○ 名古屋市場 × ○ 福岡市場 × ○ 札幌市場 × ○",
      "上場投資信託(ETF・REIT) ○ ○",
    ]),
  ],
});
