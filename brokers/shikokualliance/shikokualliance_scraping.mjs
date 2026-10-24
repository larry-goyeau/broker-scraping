// What Shikoku Alliance Securities (四国アライアンス証券, Iyo Bank group)
// sells online.
//
// The online trade carries domestic shares and domestic funds only, cash
// trading, and its trading-hours table names only the TSE ("東証"). The
// product page says the firm handles the shares listed on the TSE
// ("東京証券取引所に上場されている株式を取り扱っております"), with no limiting
// word, and handles the listed funds too ("上場投資信託であるＥＴＦやＲＥＩＴも
// 取り扱っております"). So the Tokyo list is the JPX month-end file (see
// ../aizawa/shelf.mjs): Prime, Standard and Growth shares, domestic and
// foreign, and the ETF・ETN section, less the names JASDEC does not handle.
//
// New York shares are only "part of" the New York listings ("株式の一部"),
// sold over the counter at the firm's own price or by phone; the online
// trade does not carry them, so they are not written.
//
//   https://www.shikoku-alliance-sec.co.jp/product/
//   https://www.shikoku-alliance-sec.co.jp/onlinetrade/
//   https://www.shikoku-alliance-sec.co.jp/faq/onlinetrade.html
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/shikokualliance/shikokualliance_scraping.mjs

import { fetchText, textOf, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { droppedText, japanShelf } from "../aizawa/shelf.mjs";

const PRODUCT = "https://www.shikoku-alliance-sec.co.jp/product/";
const ONLINE = "https://www.shikoku-alliance-sec.co.jp/onlinetrade/";

async function checkPages() {
  const product = textOf(await fetchText(PRODUCT));
  if (!product.includes("東京証券取引所に上場されている株式を取り扱っております")) {
    throw new Error("Shikoku Alliance product page no longer says TSE-listed shares");
  }
  const online = textOf(await fetchText(ONLINE));
  if (!online.includes("国内株式・国内投資信託の売買")) throw new Error("Shikoku Alliance online page no longer sells domestic shares");
}

const [, shelf] = await Promise.all([checkPages(), japanShelf({ places: ["Tokyo"] })]);
writeCatalogue(import.meta.url, "shikokualliance-parsed.json", shelf.rows, { "Tokyo STOCK": 3500, "Tokyo ETF": 300 });
console.error(`Left out: ${droppedText(shelf.dropped)}`);
