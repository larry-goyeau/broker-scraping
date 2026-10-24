// What Marusan Securities (丸三証券) sells online, through MARUSAN-NET, with
// no login.
//
// The MARUSAN-NET notes page states the scope:
//   "お取引の対象は、東京証券取引所、名古屋証券取引所の国内上場銘柄です。"
// with "（一部の銘柄には取引の制限がございます）" and no list. The domestic
// fee page says the tariff applies to "国内上場株式（ＥＴＦやＲＥＩＴ等を
// 含む）", MARUSAN-NET paying 75% of it. The foreign-share fee page says
// foreign shares cannot be traded on MARUSAN-NET, so the US, Hong Kong,
// London and Frankfurt places in broker-list.json are branch-only and not
// in this file.
//
// Tokyo is the JPX month-end file read by ../tachibana/wholeTokyo.mjs:
// Prime, Standard and Growth shares, domestic and foreign (国内上場 means
// listed in Japan), 出資証券, and every ETF and ETN. Nagoya is the
// exchange's Premier, Main and Next search and its ETF board. The JASDEC
// non-handled code and PRO Market are out. REIT stays out like in the
// other Japanese files (none of STOCK/ETF/ETC/ETN).
//
//   https://www.marusan-sec.co.jp/torihiki/marusannet/userguide/marusannet_09/
//   https://www.marusan-sec.co.jp/torihiki/fee/fee_01/  (fees)
//   https://www.marusan-sec.co.jp/torihiki/fee/fee_03/
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//   https://www.nse.or.jp/api/stock/search.json
//
//   node brokers/marusan/marusan_scraping.mjs

import { buildWholeJapan, requireSentences } from "../tachibana/wholeTokyo.mjs";

await buildWholeJapan({
  folderUrl: import.meta.url,
  file: "marusan-parsed.json",
  foreignShares: true,
  foreignEtfs: true,
  nagoya: true,
  checks: [
    requireSentences("https://www.marusan-sec.co.jp/torihiki/marusannet/userguide/marusannet_09/", [
      "お取引の対象は、東京証券取引所、名古屋証券取引所の国内上場銘柄です。",
    ]),
    requireSentences("https://www.marusan-sec.co.jp/torihiki/fee/fee_01/", ["国内上場株式（ＥＴＦやＲＥＩＴ等を含む）"]),
  ],
});
