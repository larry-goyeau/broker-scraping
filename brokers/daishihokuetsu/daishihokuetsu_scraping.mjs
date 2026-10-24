// What Daishi Hokuetsu Securities (第四北越証券, Daishi Hokuetsu Bank group)
// sells through its Internet Home Trade (インターネット・ホームトレード).
//
// The home-trade special terms list the products and the markets: listed
// shares, ETFs, REITs and ETNs ("ホームトレードにより、お取扱いできる商品 ...
// 上場株式、ＥＴＦ、ＲＥＩＴ、ＥＴＮ"), on the Tokyo, Sapporo and Fukuoka
// markets, not Nagoya ("取扱市場について 東京市場、札幌市場、福岡市場 ※ 名古屋
// 市場に上場している銘柄はお取扱いしておりません"). The home-trade page's
// order-hours table names the same three ("東証、福証、札証"). No list of
// names, no limiting word: the terms only say the firm may withdraw names an
// exchange restricts. So the catalogue is the whole of the three exchanges
// (see ../aizawa/shelf.mjs): Tokyo Prime, Standard and Growth shares,
// domestic and foreign, and the ETF・ETN section; every Fukuoka and Sapporo
// listing, sole and dual, one row per place. Names JASDEC does not handle
// (the Bank of Japan's 8301) stay out. REITs are sold but are left out as in
// the other Japanese catalogues. The Nagoya sentence is read as "no orders
// on the Nagoya market": a name listed in Tokyo and Nagoya keeps its Tokyo
// row.
//
// The home trade is in principle for individuals living in Niigata
// prefecture ("原則として 新潟県内に居住の個人のお客さま にご利用いただけます");
// that is an account condition, not a catalogue rule.
//
// Abroad. The page only says a first foreign trade needs a form at the
// branch ("初めて外国証券の取引を行なう場合は、当社所定のお手続きが必要です");
// the home trade sells domestic shares and funds only, so US shares (phone
// or adviser) are not written.
//
//   https://www.dh-sec.co.jp/home_trade/
//   https://www.dh-sec.co.jp/home_trade/pdf/02.pdf  (ホームトレード特約事項)
//   https://www.dh-sec.co.jp/fee/  (home trade: 0.38% × 1.1, minimum 2,200 yen)
//
//   node brokers/daishihokuetsu/daishihokuetsu_scraping.mjs

import { fetchText, textOf, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { droppedText, japanShelf } from "../aizawa/shelf.mjs";

const HOME_TRADE = "https://www.dh-sec.co.jp/home_trade/";
const FEE = "https://www.dh-sec.co.jp/fee/";

async function checkPages() {
  const html = await fetchText(HOME_TRADE);
  const home = textOf(html);
  if (!/国内株式 取引所 注文内容[\s\S]*?東証、福証、札証/.test(home)) {
    throw new Error("Daishi Hokuetsu home-trade hours no longer name 東証、福証、札証");
  }
  if (/名証/.test(home)) throw new Error("Daishi Hokuetsu home-trade page now names 名証");
  if (!/href="\.\/pdf\/02\.pdf"[^>]*>[\s\S]*?特約事項/.test(html)) {
    throw new Error("Daishi Hokuetsu home-trade special terms no longer linked");
  }
  const fee = textOf(await fetchText(FEE));
  if (!/ホームトレード取引の手数料表[\s\S]*?株式委託手数料 （約定代金×0\.38％）×1\.10円/.test(fee)) {
    throw new Error("Daishi Hokuetsu home-trade share commission not found");
  }
}

const [, shelf] = await Promise.all([checkPages(), japanShelf({ places: ["Tokyo", "Fukuoka", "Sapporo"] })]);
writeCatalogue(import.meta.url, "daishihokuetsu-parsed.json", shelf.rows, {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  Fukuoka: 50,
  Sapporo: 30,
});
console.error(`Left out: ${droppedText(shelf.dropped)}`);
