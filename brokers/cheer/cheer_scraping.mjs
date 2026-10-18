// What CHEER Securities sells.
//
// Abroad it sells only US names, as 米国株式店頭取引: the firm is the
// counterparty at its own price, on the names it has chosen from NYSE,
// NYSE Arca and Nasdaq. The list page reads list.csv: two NISA flags, the
// kind (普通株 or ETF), ticker, English and Japanese names, the date and
// link of the foreign-securities notice. No venue or ISIN is printed, so
// the listing venue and ISIN come from ../../assets/stocks.csv and
// etfs.csv (see ../mitsubishiufjesmart/japan.mjs).
//
// At home the domestic page says the brokerage (委託) book is, in
// principle, every name listed on the Tokyo Stock Exchange, except: JASDEC
// non-handled names, TOKYO PRO Market, the ETNs that are exceptions for the
// specified account and dividends, names that need a foreign-securities
// account, WisdomTree, Tokyo-listed foreign shares, and country, venture
// and infrastructure funds. Tokyo is the JPX month-end file: Prime,
// Standard and Growth domestic shares, 出資証券, and the ETF・ETN section.
// The page does not say which ETNs are the exception, so every ETN stays
// out. An ETF whose manager on the JPX ETF list is a foreign company
// (WisdomTree Management Jersey, State Street, World Gold Trust) is a
// foreign fund that needs the foreign account and stays out. The REIT/fund
// section is left out as in the other Japanese catalogues. The dealer
// (店頭) Japanese book is a subset of the same Tokyo names.
//
//   https://www.cheer-sec.co.jp/service/us-stock.html
//   https://www.cheer-sec.co.jp/service/us-stock/list.html
//   https://www.cheer-sec.co.jp/service/us-stock/list.csv
//   https://www.cheer-sec.co.jp/service/jp-stock.html
//
//   node brokers/cheer/cheer_scraping.mjs

import {
  attachJapanIsins,
  etfManagers,
  fetchText,
  fold,
  foreignManager,
  jasdecRefused,
  jpRow,
  normalize,
  parseCsv,
  textOf,
  tokyoListing,
  usRow,
  writeCatalogue,
} from "../mitsubishiufjesmart/japan.mjs";

const SITE = "https://www.cheer-sec.co.jp";
const US_CSV = `${SITE}/service/us-stock/list.csv`;
const JP_PAGE = `${SITE}/service/jp-stock.html`;

const KIND = { 普通株: "STOCK", ETF: "ETF" };
const TOKYO_STOCK = new Set(["プライム（内国株式）", "スタンダード（内国株式）", "グロース（内国株式）", "出資証券"]);

async function usBook() {
  const table = parseCsv(await fetchText(US_CSV));
  const rows = [];
  for (const line of table) {
    const [, , kind, ticker, english, japanese] = line.map(normalize);
    const type = KIND[kind];
    if (!type || !/^[A-Z][A-Z0-9.\-/]*$/.test(ticker || "")) throw new Error(`US CSV line not read: ${line.join(",")}`);
    rows.push(usRow({ symbol: ticker, name: english, type, note: `${kind} ${japanese}` }));
  }
  if (rows.length < 80) throw new Error(`US CSV has only ${rows.length} lines`);
  return rows;
}

async function checkDomestic() {
  const text = textOf(await fetchText(JP_PAGE));
  const rule = "次の銘柄は取扱いません。 証券保管振替機構の非取扱銘柄、TOKYO PRO Market市場上場銘柄、ETF・ETN・REITのうち、特定口座及び配当等で例外となる指標連動証券（ETN)、外国証券口座が必要な銘柄、WisdomTree、国内上場外国株式、カントリーファンド、ベンチャーファンド、インフラファンド";
  if (!text.includes("当社では原則、東京証券取引所に上場している銘柄を取扱います。") || !text.includes(rule)) {
    throw new Error("domestic page no longer states the Tokyo scope and its exclusions as read");
  }
}

const [us, tokyo, managers, refused] = await Promise.all([
  usBook(),
  tokyoListing(),
  etfManagers(),
  jasdecRefused(),
  checkDomestic(),
]);

const rows = [...us];
const dropped = {};
const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
const foreignFunds = [];
for (const line of tokyo) {
  if (refused.has(line.code)) drop("JASDEC");
  else if (TOKYO_STOCK.has(line.section)) rows.push(jpRow({ ...line, exchange: "Tokyo", type: "STOCK" }));
  else if (line.section === "ETF・ETN") {
    if (fold(line.name).includes("ETN")) drop("ETN");
    else if (/WisdomTree|ウィズダムツリー/i.test(fold(line.name)) || foreignManager(managers.get(line.code))) {
      drop("foreign ETF");
      foreignFunds.push(line.code);
    } else rows.push(jpRow({ ...line, exchange: "Tokyo", type: "ETF" }));
  } else drop(line.section);
}
if (foreignFunds.length < 15) throw new Error(`only ${foreignFunds.length} foreign ETFs found on the JPX list`);

attachJapanIsins(rows);
writeCatalogue(import.meta.url, "cheer-parsed.json", rows, { "Tokyo STOCK": 3500, "Tokyo ETF": 300 });
console.error(`Left out: ${Object.entries(dropped).map(([why, count]) => `${count} ${why}`).join(", ")}`);
console.error(`Foreign ETFs left out: ${foreignFunds.sort().join(", ")}`);
