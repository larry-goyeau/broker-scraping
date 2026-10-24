// What Mito Securities (水戸証券) sells online, through 水戸ネット, with no
// login.
//
// The 水戸ネット product page names two whole markets:
//   "国内現物株式 東京証券取引所上場株式（プライム、スタンダード、グロース）
//   名古屋証券取引所上場株式（プレミア、メイン、ネクスト） ※ETF、REIT、ETN
//   もお取引いただけます。"
// Fukuoka and Sapporo are not online places, and US shares (NYSE, Nasdaq)
// are dealt through the branches only; the internet fee page covers
// domestic shares only. So this file has Tokyo and Nagoya.
//
// Tokyo is the JPX month-end file read by ../tachibana/wholeTokyo.mjs:
// Prime, Standard and Growth shares, domestic and foreign (the page names
// the segments), 出資証券, and every ETF and ETN. Nagoya is the exchange's
// Premier, Main and Next search and its ETF board. The JASDEC non-handled
// code and PRO Market are out. REIT stays out like in the other Japanese
// files (none of STOCK/ETF/ETC/ETN).
//
//   https://www.mito.co.jp/service/type/internet/products.html
//   https://www.mito.co.jp/service/type/internet/commissions.html  (fees)
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//   https://www.nse.or.jp/api/stock/search.json
//
//   node brokers/mito/mito_scraping.mjs

import { buildWholeJapan, requireSentences } from "../tachibana/wholeTokyo.mjs";

await buildWholeJapan({
  folderUrl: import.meta.url,
  file: "mito-parsed.json",
  foreignShares: true,
  foreignEtfs: true,
  nagoya: true,
  checks: [
    requireSentences("https://www.mito.co.jp/service/type/internet/products.html", [
      "東京証券取引所上場株式（プライム、スタンダード、グロース）",
      "名古屋証券取引所上場株式（プレミア、メイン、ネクスト）",
      "※ETF、REIT、ETNもお取引いただけます。",
    ]),
  ],
});
