// What Daiwa Securities (大和証券) sells through its online trade (ダイワの
// オンライントレード), in shares and exchange-traded funds, with no login.
//
// The online product page lists, for shares: domestic listed shares, Tokyo-
// listed foreign shares and listed funds included ("国内上場株式 ※ 東証外国株式
// や国内上場投信（ETF・REIT）を含む"); US shares, the names the firm designates
// on NYSE, Nasdaq and other US markets ("当社の指定するニューヨーク証券取引所
// （NYSE）・ナスダック（NASDAQ）市場等上場銘柄がお取引可能"); and Chinese shares
// on the HKEX Main Board and GEM. Other foreign markets (Europe, ASX, SGX,
// Thailand...) are taken at the branch or by phone, not online.
//
// Japan. The exchange page says which domestic exchanges take online orders
// ("インターネットでのお取引"): Tokyo (Prime, Standard, Growth) and Nagoya
// (Premier, Main, Next) "可能", Sapporo and Fukuoka "-". broker-list.json
// also names Sapporo and Fukuoka with no restriction; the firm's page says
// they are not online, so they are left out. Tokyo is the whole TSE book
// (../hachijuni/tseBook.mjs): Prime, Standard and Growth shares, domestic
// and foreign, 出資証券, ETFs and ETNs (the firm has an ETN page), less
// TOKYO PRO Market, JASDEC's non-handled 8301, bond-type class shares,
// delisted and 整理銘柄 lines. Nagoya is the exchange's Premier, Main and
// Next search and its ETF board (../aizawa/shelf.mjs). REITs are sold but
// left out as in the other Japanese catalogues. A name on both exchanges
// is one row per exchange.
//
// United States. No list: the names are seen only after login ("オンライン
// トレードの取扱銘柄は、オンライントレードにログイン後...銘柄一覧でご確認いただけ
// ます"). The US page states the count, "取扱銘柄 ETFを含め約 2,000銘柄 を取扱い
// ます", so under the owner's stated-count rule the US catalogue is the
// 2,000 most traded titles of the US book (../wellstrade/usBook.mjs: every
// share, ADR, preferred, closed-end fund, ETF and ETN listed on a US
// exchange, less warrants, rights, units, notes and open halts), ranked by
// traded value (../daiwa/usPopular.mjs), shares and ETFs together as the
// page counts them. The venues are named "NYSE、NASDAQ市場等" (and others),
// so no US venue is dropped; the US is one NBBO market, one row per title.
// No other exception is named ("一部の銘柄で取扱できない場合があります" is not
// a list).
//
// Hong Kong. Online, "700銘柄を超える香港証券取引所上場の当社指定銘柄 ※ のみ",
// listed only after login; the trading currency is the Hong Kong dollar
// ("売買通貨 香港ドル"). So the catalogue is the 700 most traded HKD counters
// of the HKEX book (../primehk/hkexBook.mjs: Main Board and GEM shares,
// REITs and exchange-traded products, less suspended, never-traded and
// temporary counters), ranked by the last session's traded value (shares
// traded times the previous close, from HKEX's daily quotations). RMB and
// USD counters stay out.
//
// Fees: online domestic commission 0.94820% up to 1 million yen (Consulting
// course), 0.37950% (Direct course) or the 3,300-yen daily flat rate; US
// online 0.891% domestic commission plus 0.25% local commission.
//
//   https://www.daiwa.jp/onlinetrade/product/
//   https://www.daiwa.jp/products/equity/stc/brs/
//   https://www.daiwa.jp/products/equity/foreign/usa/
//   https://www.daiwa.jp/products/equity/foreign/hng/
//   https://www.daiwa.jp/service/fee/
//
//   node brokers/daiwa/daiwa_scraping.mjs

import { fetchText, textOf, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { tseBook } from "../hachijuni/tseBook.mjs";
import { droppedText, japanShelf } from "../aizawa/shelf.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { hkexBook, hkexQuotations } from "../primehk/hkexBook.mjs";
import { topByPopularity, usPopularity } from "./usPopular.mjs";

const SITE = "https://www.daiwa.jp";
const PAGES = {
  product: `${SITE}/onlinetrade/product/`,
  exchanges: `${SITE}/products/equity/stc/brs/`,
  us: `${SITE}/products/equity/foreign/usa/`,
  hk: `${SITE}/products/equity/foreign/hng/`,
  fees: `${SITE}/service/fee/`,
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readPages() {
  const text = {};
  for (const [key, url] of Object.entries(PAGES)) {
    text[key] = textOf(await fetchText(url));
    await pause(800);
  }
  const need = (key, pattern, what) => {
    const match = text[key].match(pattern);
    if (!match) throw new Error(`Daiwa ${key} page no longer says ${what}`);
    return match;
  };
  need("product", /国内上場株式 ※ 東証外国株式や国内上場投信（ETF・REIT）を含む/, "domestic shares with ETF/REIT");
  need("product", /当社の指定するニューヨーク証券取引所（NYSE）・ナスダック（NASDAQ）市場等上場銘柄/, "the US offer");
  need("exchanges", /東京証券取引所 開設市場[^※]*?値付き開始 可能/, "Tokyo online");
  need("exchanges", /名古屋証券取引所 開設市場[^※]*?値付き開始 可能/, "Nagoya online");
  need("exchanges", /札幌証券取引所 開設市場[^※]*?値付き開始 -/, "Sapporo not online");
  need("exchanges", /福岡証券取引所 開設市場[^※]*?値付き開始 -/, "Fukuoka not online");
  need("us", /市場等となっております/, "NYSE, NASDAQ and other markets");
  const us = Number(need("us", /ETFを含め約\s*([\d,]+)銘柄/, "the US count")[1].replace(/,/g, ""));
  const hk = Number(need("hk", /([\d,]+)銘柄を超える香港証券取引所上場の当社指定銘柄/, "the Hong Kong count")[1].replace(/,/g, ""));
  need("hk", /売買通貨 香港ドル/, "HKD trading");
  need("fees", /インターネット （オンライントレード）[\s\S]*?0\.94820%/, "the online share commission");
  if (us < 1000 || hk < 300) throw new Error(`Daiwa counts read as US ${us}, HK ${hk}`);
  return { us, hk };
}

const counts = await readPages();

const tokyo = await tseBook();
const nagoya = await japanShelf({ places: ["Nagoya"] });

const usLines = await usBook();
const scores = await usPopularity(usLines);
const us = topByPopularity(usLines, scores, counts.us);

const hkex = await hkexBook();
const quotes = (await hkexQuotations()).quotes;
const hkd = hkex.rows.filter((row) => row.currency === "HKD");
const traded = (row) => (quotes.get(row.ticker)?.previous || 0) * (quotes.get(row.ticker)?.volume || 0);
hkd.sort((left, right) => traded(right) - traded(left) || left.ticker.localeCompare(right.ticker));
const hk = hkd.slice(0, counts.hk).map(({ lot, ...row }) => row);

writeCatalogue(import.meta.url, "daiwa-parsed.json", [...tokyo.rows, ...nagoya.rows, ...us.kept, ...hk], {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  "Nagoya STOCK": 150,
  HKEX: counts.hk,
});
const kinds = (rows) => Object.entries(rows.reduce((acc, row) => ((acc[row.type] = (acc[row.type] || 0) + 1), acc), {})).map(([type, n]) => `${n} ${type}`).join(", ");
console.error(`US: top ${counts.us} of ${usLines.length} by traded value (${kinds(us.kept)}); FINRA days ${scores.dates.at(-1)}–${scores.dates[0]}; last kept ${us.kept.at(-1).ticker}`);
console.error(`HK: top ${hk.length} of ${hkd.length} HKD counters (${kinds(hk)}); last kept ${hk.at(-1).ticker} ${hk.at(-1).name}`);
console.error(`Tokyo left out: ${JSON.stringify(tokyo.dropped)}`);
console.error(`Nagoya left out: ${droppedText(nagoya.dropped) || "none"}`);
