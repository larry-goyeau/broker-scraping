// What Hamagin Tokai Tokyo Securities (浜銀TT証券, Concordia / Bank of
// Yokohama and Tokai Tokyo group) sells through 浜銀TT証券ダイレクト, its
// online service.
//
// The online service takes buy and sell orders for domestic cash shares
// "and the like" ("国内現物株式等の買付注文・売却注文"), at 40% off the branch
// commission. The commission table puts ETFs and J-REITs in that line
// ("株式等委託手数料 (株式、ETF、J-REIT等) ... 浜銀TT証券ダイレクト 基本委託手数料
// より 40％割引"). The domestic-share page says the firm trades the shares of
// every domestic market ("東京、名古屋等、国内全株式市場の株式をお取り引きに
// なれます"), and the online page gives the other exchanges their own
// cut-off ("東京証券取引所以外については、15:30が締切時間となります"). So the
// catalogue is the whole of the four exchanges (see ../aizawa/shelf.mjs):
// Tokyo Prime, Standard and Growth shares, domestic and foreign, and the
// ETF・ETN section; Nagoya Premier, Main, Next and its ETF board; every
// Fukuoka and Sapporo listing, sole and dual, one row per place. Names
// JASDEC does not handle (the Bank of Japan's 8301) stay out. The same page
// sends ETF and REIT questions to the branch ("ETF（上場投資信託）については、
// お近くの店舗までお問い合わせください"), which is about advice, not the order
// channel: the online commission names ETFs. REITs are left out as in the
// other Japanese catalogues.
//
// Foreign shares (US, Europe, Hong Kong, China, Korea) are branch-only
// (agency orders from USD 2,000 or JPY 500,000, counter trades); the online
// service sells domestic shares and funds only, so they are not written.
//
//   https://www.hamagintt.co.jp/service/online/
//   https://www.hamagintt.co.jp/service/online/useful/
//   https://www.hamagintt.co.jp/products/domestic_stock.html
//   https://www.hamagintt.co.jp/service/charge.html
//
//   node brokers/hamagin/hamagin_scraping.mjs

import { fetchText, textOf, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { droppedText, japanShelf } from "../aizawa/shelf.mjs";

const ONLINE = "https://www.hamagintt.co.jp/service/online/";
const USEFUL = "https://www.hamagintt.co.jp/service/online/useful/";
const DOMESTIC = "https://www.hamagintt.co.jp/products/domestic_stock.html";
const CHARGE = "https://www.hamagintt.co.jp/service/charge.html";

async function checkPages() {
  const [online, useful, domestic, charge] = (await Promise.all([ONLINE, USEFUL, DOMESTIC, CHARGE].map((url) => fetchText(url)))).map(textOf);
  if (!online.includes("国内現物株式等の買付注文・売却注文")) throw new Error("Hamagin online page no longer sells domestic shares");
  if (!useful.includes("東京証券取引所以外については、15:30が締切時間となります")) {
    throw new Error("Hamagin online page no longer takes orders outside the TSE");
  }
  if (!domestic.includes("東京、名古屋等、国内全株式市場の株式をお取り引きになれます")) {
    throw new Error("Hamagin domestic-share page no longer names every domestic market");
  }
  if (!/株式等委託手数料 ?\(株式、ETF、J-REIT等\)[\s\S]*?浜銀TT証券ダイレクト[\s\S]*?40％割引/.test(charge)) {
    throw new Error("Hamagin online commission for shares and ETFs not found");
  }
}

const [, shelf] = await Promise.all([
  checkPages(),
  japanShelf({ places: ["Tokyo", "Nagoya", "Fukuoka", "Sapporo"] }),
]);
writeCatalogue(import.meta.url, "hamagin-parsed.json", shelf.rows, {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  Nagoya: 150,
  Fukuoka: 50,
  Sapporo: 30,
});
console.error(`Left out: ${droppedText(shelf.dropped)}`);
