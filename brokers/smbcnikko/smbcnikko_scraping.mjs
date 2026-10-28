// What SMBC Nikko Securities (SMBC日興証券) sells through its online trade
// (日興イージートレード), in shares and exchange-traded funds, with no login.
//
// Japan. The online domestic page lists what can be traded online
// ("オンライントレード（日興イージートレード）では以下の市場に上場している銘柄・
// 上場投信が取引可能です"): listed shares on the TSE (Prime, Standard, Growth)
// and on Nagoya (Premier, Main, Next); 優先出資証券, ETFs ("指数連動型上場投資
// 信託・日経300投信") and REITs on the TSE only. Not sold online: "東証上場の
// 外国株式", except "東証グロース上場銘柄、ビート・ホールディングス・リミテッド
// （銘柄コード：9399）、メディシノバ・インク（銘柄コード：4875）ならびに一部外国
// ETF"; country and venture funds; names under trading restrictions.
// broker-list.json also names Fukuoka and Sapporo; the online page does not,
// so they are left out (branch business).
// So Tokyo is the TSE book (../hachijuni/tseBook.mjs): Prime, Standard and
// Growth domestic shares; Tokyo-listed foreign shares only on Growth, plus
// 9399 and 4875; the 出資証券 section (8421's 優先出資証券); ETFs, the
// foreign-domiciled ones included (WisdomTree and the funds of a foreign
// manager on JPX's ETF list: the page says "一部" of them are sold and names
// none, so all of them, owner 2026-10-26); and the TSE's ETNs (JPX's ETN
// lists, owner 2026-10-26, although the online table names shares,
// 優先出資証券, ETF and REIT only). Also out: TOKYO PRO Market, JASDEC's
// 8301, bond-type class shares, delisted and 整理銘柄 lines; REITs as in the other Japanese
// catalogues. Nagoya is the exchange's Premier, Main and Next share search
// (../aizawa/shelf.mjs); its ETF board stays out (ETFs are TSE only). A name
// on both exchanges is one row per exchange.
//
// United States. No public list: the names are shown after login ("ログイン
// して 取扱銘柄一覧をみる"); the only public file (foreignlist/csv/data.csv)
// is a ~140-name disclosure list, not the online shelf. The online US page
// states the count and the venues: "NYSE、NYSE Arca、NYSE American、NASDAQに
// 上場している株式、ETF、ADRから、当社が厳選した約2,300※の主要銘柄をお取引いた
// だけます". Under the owner's stated-count and named-venue rules, the US
// catalogue is the 2,300 most traded titles (../daiwa/usPopular.mjs, traded
// value) of the US book (../wellstrade/usBook.mjs) listed on NYSE, NYSE
// Arca, NYSE American or Nasdaq; Cboe BZX, Texas and IEX listings stay out.
// usBook already leaves out warrants, rights, units, notes and open halts.
// The US is one NBBO market, one row per title, in dollars.
//
// Fees: online domestic commission, Direct course 137 yen up to 100,000 yen
// (880 yen up to 1 million); Sogo course 0.8855% (min 1,925 yen); US online
// Direct course 0.495% capped at USD 22.
//
//   https://www.smbcnikko.co.jp/products/stock/domestic/online/
//   https://www.smbcnikko.co.jp/products/stock/foreign/
//   https://www.smbcnikko.co.jp/products/stock/foreign/usa/online/
//   https://www.smbcnikko.co.jp/service/fee/stock/
//   https://www.smbcnikko.co.jp/service/fee/fstock/usa/
//
//   node brokers/smbcnikko/smbcnikko_scraping.mjs

import { fetchText, textOf, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { tseBook } from "../hachijuni/tseBook.mjs";
import { droppedText, japanShelf } from "../aizawa/shelf.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topByPopularity, usPopularity } from "../daiwa/usPopular.mjs";

const SITE = "https://www.smbcnikko.co.jp";
const DOMESTIC = `${SITE}/products/stock/domestic/online/`;
const FOREIGN = `${SITE}/products/stock/foreign/`;
const US = `${SITE}/products/stock/foreign/usa/online/`;
const FEES = `${SITE}/service/fee/stock/`;
const US_VENUES = new Set(["XNYS", "ARCX", "XASE", "XNAS"]);
const FOREIGN_KEPT = new Set(["9399", "4875"]);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function page(url) {
  const text = textOf(await fetchText(url, "shift_jis"));
  await pause(800);
  return text;
}

async function readPages() {
  const domestic = await page(DOMESTIC);
  for (const phrase of [
    "上場株式 東京証券取引所 プライム、スタンダード、グロース",
    "名古屋証券取引所 プレミア、メイン、ネクスト",
    "優先出資証券 東京証券取引所",
    "ETF （指数連動型上場投資信託・ 日経300投信） 東京証券取引所",
    "東証上場の外国株式 ※ 日興イージートレードでは、東証グロース上場銘柄、ビート・ホールディングス・リミテッド（銘柄コード：9399）、メディシノバ・インク（銘柄コード：4875）ならびに一部外国ETFをお取り扱いしております。",
  ]) {
    if (!domestic.includes(phrase)) throw new Error(`SMBC Nikko online domestic page no longer says ${phrase}`);
  }
  if (/福岡|札幌/.test(domestic.slice(domestic.indexOf("取扱市場"), domestic.indexOf("以下の銘柄は")))) {
    throw new Error("SMBC Nikko online domestic table now names another exchange");
  }
  const foreign = await page(FOREIGN);
  if (!foreign.includes("米国市場の株式およびETF等の一部銘柄のみ取り扱いとなります")) {
    throw new Error("SMBC Nikko foreign page no longer limits online trading to US names");
  }
  const us = await page(US);
  const stated = us.match(/NYSE、NYSE Arca、NYSE American、NASDAQに上場している株式、ETF、ADRから、当社が厳選した約([\d,]+)※の主要銘柄/);
  if (!stated) throw new Error("SMBC Nikko US page no longer states the venues and the count");
  const fees = await page(FEES);
  if (!/ダイレクトコース オンライントレード[\s\S]*?～10万円 137円/.test(fees)) throw new Error("SMBC Nikko online share commission not found");
  const count = Number(stated[1].replace(/,/g, ""));
  if (count < 1000) throw new Error(`SMBC Nikko US count read as ${count}`);
  return count;
}

const usCount = await readPages();

const tokyo = await tseBook();
const foreignOut = [];
const tokyoRows = tokyo.rows.filter((row) => {
  if (!row.raw.includes("（外国株式）") || row.raw.includes("グロース（外国株式）") || FOREIGN_KEPT.has(row.ticker)) return true;
  foreignOut.push(`${row.ticker} ${row.name}`);
  return false;
});
const nagoya = await japanShelf({ places: ["Nagoya"] });
const nagoyaRows = nagoya.rows.filter((row) => row.type === "STOCK");

const usLines = (await usBook()).filter((row) => US_VENUES.has(row.mic));
const scores = await usPopularity(usLines);
const us = topByPopularity(usLines, scores, usCount);

writeCatalogue(import.meta.url, "smbcnikko-parsed.json", [...tokyoRows, ...nagoyaRows, ...us.kept], {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  "Nagoya STOCK": 150,
  XNAS: 500,
  XNYS: 500,
  ARCX: 100,
});
const kinds = (rows) => Object.entries(rows.reduce((acc, row) => ((acc[row.type] = (acc[row.type] || 0) + 1), acc), {})).map(([type, n]) => `${n} ${type}`).join(", ");
console.error(`US: top ${usCount} of ${usLines.length} NYSE/Arca/American/Nasdaq lines by traded value (${kinds(us.kept)}); last kept ${us.kept.at(-1).ticker}`);
console.error(`Tokyo foreign shares left out: ${foreignOut.join(", ") || "none"}`);
console.error(`Tokyo left out: ${JSON.stringify(tokyo.dropped)}`);
console.error(`Nagoya left out: ${droppedText(nagoya.dropped) || "none"}; Nagoya ETF board: ${nagoya.rows.length - nagoyaRows.length}`);
