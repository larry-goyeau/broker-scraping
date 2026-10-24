// What Hokuyo Securities (北洋証券, North Pacific Bank group) sells through
// its online service (北洋証券オンラインサービス).
//
// The online trade takes buy and sell orders for domestic shares and
// domestic funds ("■国内株式の買付注文・売却注文"), and the domestic shares
// include ETFs, REITs and ETNs, cash only ("※２：上場投資信託(ETF)、上場不動産
// 投資信託(REIT)、上場投資証券(ETN)も含みます。なお、現物取引に限ります。").
// The online order-hours table names only the TSE ("平日 東証 売買"), so the
// place is Tokyo alone, although the branch handles every domestic exchange
// ("国内金融商品取引所に上場されている株式を取扱っております"). No list of
// names and no limiting word, so the Tokyo list is the JPX month-end file
// (see ../aizawa/shelf.mjs): Prime, Standard and Growth shares, domestic and
// foreign, and the ETF・ETN section, less the names JASDEC does not handle.
// REITs are sold but are left out as in the other Japanese catalogues.
//
// US shares (agency orders from USD 3,000, counter trades from USD 30,000)
// are taken by the adviser or the branch, not online, so they are not
// written.
//
//   https://www.hokuyo-sec.co.jp/online/service/
//   https://www.hokuyo-sec.co.jp/product/stock/
//   https://www.hokuyo-sec.co.jp/product/commission/  (online: 50% of the
//     branch commission, "上場有価証券売買委託手数料 基本料金の50％")
//
//   node brokers/hokuyo/hokuyo_scraping.mjs

import { fetchText, textOf, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { droppedText, japanShelf } from "../aizawa/shelf.mjs";

const ONLINE = "https://www.hokuyo-sec.co.jp/online/service/";
const COMMISSION = "https://www.hokuyo-sec.co.jp/product/commission/";

async function checkPages() {
  const online = textOf(await fetchText(ONLINE));
  for (const phrase of ["■国内株式の買付注文・売却注文", "上場投資信託(ETF)、上場不動産投資信託(REIT)、上場投資証券(ETN)も含みます"]) {
    if (!online.includes(phrase)) throw new Error(`Hokuyo online page no longer says ${phrase}`);
  }
  if (!/【オンライントレード：国内株式】 取引所 注文内容[\s\S]*?平日 東証 売買/.test(online)) {
    throw new Error("Hokuyo online hours table no longer names 東証");
  }
  if (/名証|福証|札証/.test(online)) throw new Error("Hokuyo online page now names another domestic exchange");
  const commission = textOf(await fetchText(COMMISSION));
  if (!commission.includes("上場有価証券売買委託手数料 基本料金の50％")) {
    throw new Error("Hokuyo online share commission not found");
  }
}

const [, shelf] = await Promise.all([checkPages(), japanShelf({ places: ["Tokyo"] })]);
writeCatalogue(import.meta.url, "hokuyo-parsed.json", shelf.rows, { "Tokyo STOCK": 3500, "Tokyo ETF": 300 });
console.error(`Left out: ${droppedText(shelf.dropped)}`);
