// What Tachibana Securities (立花証券ｅ支店) sells online, with no login.
//
// The product page states the cash book as the whole Tokyo Stock
// Exchange, with two named exclusions and the funds included:
//   "東証上場銘柄（外国株、他市場を優先市場とする重複上場銘柄を除く）"
//   "ETF 、 ETN 、 REIT（不動産投資信託証券） 、 指数連動型上場投資信託、
//    インフラファンド等も含みます。"
// Tokyo is the only place: e支店 sells no foreign share and routes nothing
// to Nagoya, Fukuoka or Sapporo.
//
// So the book is the JPX month-end file read by ./wholeTokyo.mjs:
// domestic Prime, Standard and Growth shares and 出資証券, every ETF and
// ETN (a foreign-domiciled fund is an ETF, not a foreign share, and
// stays). Tokyo-listed foreign shares are out (外国株). REIT and
// infrastructure funds are in the broker's book but are none of
// STOCK/ETF/ETC/ETN, so they stay out like in the other Japanese files.
//
// Not applied: "他市場を優先市場とする重複上場銘柄" (a dual listing whose
// priority market is another exchange). Neither JPX nor Nagoya publishes
// that flag, so such a name, if any, is still in the file.
//
//   https://www.e-shiten.jp/serviceitem/
//   https://www.e-shiten.jp/TorihikiRule/cost/  (fees)
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/tachibana/tachibana_scraping.mjs

import { buildWholeJapan, requireSentences } from "./wholeTokyo.mjs";

await buildWholeJapan({
  folderUrl: import.meta.url,
  file: "tachibana-parsed.json",
  foreignShares: false,
  foreignEtfs: true,
  nagoya: false,
  checks: [
    requireSentences("https://www.e-shiten.jp/serviceitem/", [
      "東証上場銘柄（外国株、他市場を優先市場とする重複上場銘柄を除く）",
      "ETF 、 ETN 、 REIT（不動産投資信託証券）",
    ]),
  ],
});
