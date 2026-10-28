// The whole Tokyo Stock Exchange book, for the scrapers of brokers whose
// only place is the TSE. Built on the sources read by
// ../mitsubishiufjesmart/japan.mjs (the same as ../aizawa/shelf.mjs and
// ../tachibana/wholeTokyo.mjs), and brought up to today with the exchange's
// own live pages, since the JPX file is a month-end snapshot.
//
// Base: the JPX month-end file (data_j.xlsx), one line per code with its
// 市場・商品区分:
//   Prime, Standard and Growth shares, domestic and foreign → STOCK
//   出資証券 (8421 Shinkin Central Bank) → STOCK, a listed, exchange-traded
//     equity line
//   ETF・ETN → ETN when the code is on JPX's ETN list or the name says ETN,
//     else ETF (gold and other commodity trusts are filed as ETF, as in the
//     other Japanese catalogues)
//   TOKYO PRO Market → out: professional ("specified") investors only
//   REIT・ベンチャーファンド・カントリーファンド・インフラファンド → out: a
//     REIT or a closed fund is none of STOCK/ETF/ETN/ETC
// Left out everywhere:
//   - a code on JASDEC's non-handled table (8301, the Bank of Japan): it
//     cannot be held in a book-entry account;
//   - a bond-type class share (社債型種類株式): a bond;
//   - a line on JPX's delisting page whose delisting date (上場廃止日) has
//     come (Tokyo time; the last trading day is the day before);
//   - a 整理銘柄 (security to be delisted, in its run-off period), shares
//     and other products: it is no longer a line a broker sells;
//   - an ETF or ETN of the month-end file that is no longer on JPX's
//     current ETF or ETN lists (plain and leveraged/inverse pages): delisted
//     since the month end.
// Added: a share on JPX's new-listing page whose listing date has come and
// that the month-end file does not carry yet (not TOKYO PRO Market), and an
// ETF or ETN on JPX's current lists that the file does not carry yet.
//
// Trading halts: JPX's 売買停止情報 page lists only intraday news halts
// (minutes to a day, resumed next session). They are returned in `halted`
// for the record and not removed. 監理銘柄 (under supervision) still trade
// normally and stay in.
//
// The ISIN is joined from ../../assets/stocks.csv and etfs.csv
// (attachJapanIsins). Every row is exchange "Tokyo", mic XTKS, currency JPY.
//
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//   https://www.jpx.co.jp/listing/stocks/new/index.html
//   https://www.jpx.co.jp/listing/stocks/delisted/index.html
//   https://www.jpx.co.jp/listing/market-alerts/supervision/index.html
//   https://www.jpx.co.jp/listing/market-alerts/supervision/02.html
//   https://www.jpx.co.jp/equities/products/etfs/issues/01.html
//   https://www.jpx.co.jp/equities/products/etfs/leveraged-inverse/01.html
//   https://www.jpx.co.jp/equities/products/etns/issues/01.html
//   https://www.jpx.co.jp/equities/products/etns/leveraged-inverse/01.html
//   https://www.jpx.co.jp/markets/equities/suspended/index.html
//   https://www.jtg-sec.co.jp/meigara/no_handling.htm
//
// Use:
//   import { tseBook } from "../hachijuni/tseBook.mjs";
//   const { rows, dropped, added, halted } = await tseBook();
//   // options: { foreignShares, foreignEtfs, etns, contributions } (all
//   // true by default; set one false only when the broker's own page
//   // excludes that category)
//
// Test: node brokers/hachijuni/tseBook.mjs

import {
  attachJapanIsins,
  fetchText,
  fold,
  foreignManager,
  jasdecRefused,
  jpCode,
  jpRow,
  normalize,
  textOf,
  tokyoListing,
} from "../mitsubishiufjesmart/japan.mjs";

const NEW_LISTINGS = "https://www.jpx.co.jp/listing/stocks/new/index.html";
const DELISTINGS = "https://www.jpx.co.jp/listing/stocks/delisted/index.html";
const SUPERVISION_SHARES = "https://www.jpx.co.jp/listing/market-alerts/supervision/index.html";
const SUPERVISION_OTHER = "https://www.jpx.co.jp/listing/market-alerts/supervision/02.html";
const ETF_LISTS = [
  "https://www.jpx.co.jp/equities/products/etfs/issues/01.html",
  "https://www.jpx.co.jp/equities/products/etfs/leveraged-inverse/01.html",
];
const ETN_LISTS = [
  "https://www.jpx.co.jp/equities/products/etns/issues/01.html",
  "https://www.jpx.co.jp/equities/products/etns/leveraged-inverse/01.html",
];
const HALTS = "https://www.jpx.co.jp/markets/equities/suspended/index.html";

const DOMESTIC = new Set(["プライム（内国株式）", "スタンダード（内国株式）", "グロース（内国株式）"]);
const FOREIGN = new Set(["プライム（外国株式）", "スタンダード（外国株式）", "グロース（外国株式）"]);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Today in Tokyo, as JPX writes dates: 2026/10/25.
function tokyoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date()).replace(/-/g, "/");
}

function tableRows(html) {
  return [...String(html).matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)].map((match) =>
    [...match[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textOf(cell[1]))
  );
}

// The rows of the table that follows a subhead (<h3>…title…</h3>).
function sectionRows(html, title) {
  const at = html.search(new RegExp(`<h3[^>]*>\\s*<span>${title}</span>`));
  if (at < 0) return null;
  const rest = html.slice(at);
  const next = rest.slice(5).search(/<h3[^>]*>/);
  return tableRows(next < 0 ? rest : rest.slice(0, next + 5));
}

// code -> { date, name, market } for delistings already effective.
async function delistedCodes(today) {
  const html = await fetchText(DELISTINGS);
  if (!html.includes("上場廃止日")) throw new Error("the JPX delisting page has no 上場廃止日 column");
  const codes = new Map();
  let lines = 0;
  for (const cells of tableRows(html)) {
    if (cells.length < 4 || !/^\d{4}\/\d{2}\/\d{2}$/.test(cells[0])) continue;
    const code = jpCode(cells[2]);
    if (!code) continue;
    lines += 1;
    if (cells[0] <= today) codes.set(code, { date: cells[0], name: cells[1], market: cells[3] });
  }
  if (lines < 20) throw new Error(`the JPX delisting page gave ${lines} lines`);
  return codes;
}

// New listings whose date has come: [{ code, name, market, date }].
async function newListings(today) {
  const html = await fetchText(NEW_LISTINGS);
  const lines = [];
  for (const block of html.split(/<tr>/).slice(1)) {
    const date = block.match(/(\d{4}\/\d{2}\/\d{2})<br/)?.[1];
    const code = block.match(/<span id="([0-9A-Z]{4,5})"><\/span>/)?.[1];
    if (!date || !code) continue;
    // The name is the first link of the cell ("（株）ルクレ", "NOK Group（株） *"),
    // before a <br> and an interview link.
    const cell = block.match(/issuename-word-break[^>]*>([\s\S]*?)<\/td>/)?.[1] || "";
    const name = textOf(cell.split(/<br/i)[0])
      .replace(/\s*\*$/, "")
      .replace(/（株）|\(株\)/g, "")
      .trim();
    lines.push({ date, code, name });
  }
  // The market is on the second line of the pair: the first cell of the
  // next <tr>, which split() put in the following block.
  const blocks = html.split(/<tr>/).slice(1);
  for (const line of lines) {
    const index = blocks.findIndex((block) => block.includes(`<span id="${line.code}"></span>`));
    line.market = textOf(blocks[index + 1]?.match(/<td[^>]*>([\s\S]*?)<\/td>/)?.[1] || "");
    if (!line.market) throw new Error(`the JPX new-listing page gave no market for ${line.code}`);
  }
  if (lines.length < 5) throw new Error(`the JPX new-listing page gave ${lines.length} lines`);
  return lines.filter((line) => line.date <= today);
}

// Codes of 整理銘柄 on a supervision page.
async function liquidationCodes(url) {
  const html = await fetchText(url);
  if (!html.includes("監理銘柄")) throw new Error(`${url} no longer shows the supervision tables`);
  const rows = sectionRows(html, "整理銘柄");
  if (!rows) throw new Error(`${url} has no 整理銘柄 section`);
  const codes = new Map();
  for (const cells of rows) {
    const code = cells.map(jpCode).find(Boolean);
    if (code) codes.set(code, normalize(cells[1]));
  }
  return codes;
}

// code -> { name, manager } from JPX's ETF or ETN list pages.
async function fundList(urls, least) {
  const funds = new Map();
  for (const url of urls) {
    await pause(1000);
    readFunds(await fetchText(url), funds);
  }
  if (funds.size < least) throw new Error(`${urls[0]} and siblings listed ${funds.size} funds`);
  return funds;
}

function readFunds(html, funds) {
  for (const cells of tableRows(html)) {
    const at = cells.findIndex((cell) => /^[0-9]{3}[0-9A-Z]$/.test(cell));
    if (at < 0) continue;
    // "ＴＯＰＩＸブル２倍上場投信 iNAV 先物型": the iNAV link and the tag after it go.
    const name = normalize((cells[at + 1] || "").replace(/\s*iNAV\b.*$/, ""));
    const manager = (cells.slice(at + 1).find((cell) => /\(\d{5}\)$/.test(cell)) || "").replace(/\s*\(\d{5}\)$/, "");
    if (!funds.has(cells[at])) funds.set(cells[at], { name, manager });
  }
}

// Today's halts: [{ code, name, from, to }]. Informational.
async function haltsToday() {
  const html = await fetchText(HALTS);
  const at = html.indexOf("本日の売買停止情報");
  const end = html.indexOf("過去の売買停止情報");
  if (at < 0 || end < 0) throw new Error("the JPX halt page changed");
  const halted = [];
  for (const cells of tableRows(html.slice(at, end))) {
    const at2 = cells.findIndex((cell) => jpCode(cell));
    if (at2 < 1) continue;
    halted.push({ code: jpCode(cells[at2]), name: cells[at2 - 1], detail: cells.slice(at2 + 1).join(" ") });
  }
  return halted;
}

export async function tseBook({ foreignShares = true, foreignEtfs = true, etns = true, contributions = true } = {}) {
  const today = tokyoToday();
  // One JPX call at a time, with a pause, to stay gentle.
  const tokyo = await tokyoListing();
  const steps = [
    () => jasdecRefused(),
    () => delistedCodes(today),
    () => newListings(today),
    () => liquidationCodes(SUPERVISION_SHARES),
    () => liquidationCodes(SUPERVISION_OTHER),
    () => fundList(ETF_LISTS, 400),
    () => fundList(ETN_LISTS, 20),
    () => haltsToday(),
  ];
  const results = [];
  for (const step of steps) {
    await pause(1000);
    results.push(await step());
  }
  const [refused, delisted, fresh, liquidationShares, liquidationOther, etfList, etnList, halted] = results;
  const liquidation = new Map([...liquidationShares, ...liquidationOther]);

  const rows = [];
  const dropped = {};
  const added = [];
  const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
  const seen = new Set();

  const take = (line, type) => {
    seen.add(line.code);
    if (refused.has(line.code)) return drop("JASDEC non-handled");
    if (line.name.includes("社債型")) return drop("bond-type class share");
    if (delisted.has(line.code)) return drop("delisted since the month-end file");
    if (liquidation.has(line.code)) return drop("整理銘柄 (to be delisted)");
    if (type === "ETN" && !etns) return drop("ETN (broker excludes)");
    if (type === "ETF" && !foreignEtfs) {
      const manager = etfList.get(line.code)?.manager;
      if (/WisdomTree|ウィズダムツリー/i.test(fold(line.name)) || foreignManager(manager)) {
        return drop("foreign-domiciled ETF (broker excludes)");
      }
    }
    rows.push(jpRow({ ...line, exchange: "Tokyo", type }));
  };

  for (const line of tokyo) {
    if (DOMESTIC.has(line.section)) take(line, "STOCK");
    else if (FOREIGN.has(line.section)) {
      if (foreignShares) take(line, "STOCK");
      else (seen.add(line.code), drop("foreign share (broker excludes)"));
    } else if (line.section === "出資証券") {
      if (contributions) take(line, "STOCK");
      else (seen.add(line.code), drop("出資証券 (broker excludes)"));
    } else if (line.section === "ETF・ETN") {
      if (!etfList.has(line.code) && !etnList.has(line.code)) {
        seen.add(line.code);
        drop("ETF/ETN no longer on JPX's list");
        continue;
      }
      const isEtn = etnList.has(line.code) || fold(line.name).includes("ETN");
      take(line, isEtn ? "ETN" : "ETF");
    } else {
      seen.add(line.code);
      drop(`Tokyo ${line.section}`);
    }
  }

  for (const line of fresh) {
    if (seen.has(line.code)) continue;
    if (/PRO/i.test(fold(line.market))) {
      seen.add(line.code);
      drop("new listing on TOKYO PRO Market");
      continue;
    }
    const before = rows.length;
    take({ code: line.code, name: line.name, section: line.market }, "STOCK");
    if (rows.length > before) added.push(`${line.code} ${line.name} (${line.market}, ${line.date})`);
  }
  for (const [list, type] of [[etfList, "ETF"], [etnList, "ETN"]]) {
    for (const [code, fund] of list) {
      if (seen.has(code)) continue;
      const before = rows.length;
      take({ code, name: fund.name, section: "ETF・ETN" }, type);
      if (rows.length > before) added.push(`${code} ${fund.name} (${type} list)`);
    }
  }

  attachJapanIsins(rows);
  const count = (type) => rows.filter((row) => row.type === type).length;
  if (count("STOCK") < 3500 || count("ETF") < 250) {
    throw new Error(`TSE book is short: ${count("STOCK")} shares, ${count("ETF")} ETFs`);
  }
  return { rows, dropped, added, halted, liquidation: [...liquidation.keys()] };
}

// Run alone: print counts.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, dropped, added, halted, liquidation } = await tseBook();
  const byType = {};
  for (const row of rows) byType[row.type] = (byType[row.type] || 0) + 1;
  const withIsin = rows.filter((row) => row.isin).length;
  const several = rows.filter((row) => row.matches).length;
  console.log(`${rows.length} rows:`, byType, `ISIN ${withIsin}, several ${several}, none ${rows.length - withIsin - several}`);
  console.log("Left out:", dropped);
  console.log("整理銘柄:", liquidation.join(", "));
  console.log(`Added since the month-end file (${added.length}):`, added.join("; "));
  console.log(`Halted today (kept): ${halted.map((line) => `${line.code} ${line.name}`).join(", ") || "none"}`);
}
