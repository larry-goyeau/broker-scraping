// What FFG Securities (FFG証券, Fukuoka Financial Group) sells online.
//
// The internet trade is Tokyo only. The service page says online clients
// trade round lots of domestic shares listed on the TSE ("東証に上場している
// 国内株式の現物単元株取引（買付・売却）ができます"), and the internet-trade
// page adds that online share trading is Tokyo-listed names only, with no
// odd lots and no order on an exchange other than the best-execution one
// ("ネットでの株式の取引は東証上場株式のみとなります"). The share page says
// every listed name is sold ("国内の金融商品取引市場に上場されている全銘柄を
// お取引いただけます"), ETFs and REITs traded like shares. So the Tokyo list
// is the JPX month-end file (see ../aizawa/shelf.mjs): Prime, Standard and
// Growth shares, domestic and foreign, and the ETF・ETN section, less the
// names JASDEC does not handle.
//
// US shares (NYSE, Nasdaq) are sold through the branches only, as agency
// orders or over the counter at FFG's own price; the internet trade does
// not carry them, so they are not written.
//
//   https://www.ffg-sec.co.jp/service/internet_trade/detail/service/
//   https://www.ffg-sec.co.jp/service/internet_trade/
//   https://www.ffg-sec.co.jp/goods/stock/
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/ffg/ffg_scraping.mjs

import { fetchText, textOf, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { droppedText, japanShelf } from "../aizawa/shelf.mjs";

const SERVICE = "https://www.ffg-sec.co.jp/service/internet_trade/detail/service/";
const TRADE = "https://www.ffg-sec.co.jp/service/internet_trade/";

async function checkPages() {
  const service = textOf(await fetchText(SERVICE));
  if (!service.includes("東証に上場している国内株式の現物単元株取引")) throw new Error("FFG service page no longer says Tokyo round lots");
  const trade = textOf(await fetchText(TRADE));
  if (!trade.includes("ネットでの株式の取引は東証上場株式のみ")) throw new Error("FFG internet-trade page no longer says Tokyo only");
}

const [, shelf] = await Promise.all([checkPages(), japanShelf({ places: ["Tokyo"] })]);
writeCatalogue(import.meta.url, "ffg-parsed.json", shelf.rows, { "Tokyo STOCK": 3500, "Tokyo ETF": 300 });
console.error(`Left out: ${droppedText(shelf.dropped)}`);
