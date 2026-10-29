// The China B-shares listed today, from the two exchanges' own lists, for
// a Hong Kong broker that trades them (christfund):
//
//   - Shanghai B-shares (900xxx, in US dollars): SSE's share list, B-share
//     tab (股票列表 → B股), the query behind
//     https://www.sse.com.cn/assortment/stock/list/share/
//   - Shenzhen B-shares (200xxx, in Hong Kong dollars): SZSE's 股票列表,
//     tab B股列表 (CATALOGID 1110, tab2), the report behind
//     https://www.szse.cn/market/product/stock/list/index.html
//
// Suspended lines are left out, read from each exchange's own quotes:
//   - SSE: the B-share board on yunhq.sse.com.cn, whose trading-phase code
//     starts with "P" for a suspended product (产品停牌) and has "0" in
//     second place for a product that cannot be traded normally;
//   - SZSE: the quote of each code; a line with no trade that day is looked
//     up in SZSE's 停复牌提示 (CATALOGID 1798, newest notice first): left
//     out when its latest notice is a suspension with no resumption time,
//     kept otherwise (an illiquid line is still listed and tradable).
// A code with a delisting date on SSE's list is left out too.
//
// ISIN and full name come from ../../assets/stocks.csv (SSE:<code>,
// SZSE:<code>) when one line matches; otherwise the exchange's name and no
// ISIN (query is then the code). Rows as in ../brightsmart: exchange SSE /
// SZSE, mic XSHG / XSHE, currency USD / HKD, type STOCK.
//
// Use:
//   import { bShareBook } from "./bShareBook.mjs";
//   const { rows, left } = await bShareBook();
//
//   node brokers/christfund/bShareBook.mjs     prints the counts

import fs from "node:fs";
import { parseCsv } from "../jtrust/jp_listings.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const LEAST = { SSE: 35, SZSE: 30 };

const SSE_LIST = "https://query.sse.com.cn/sseQuery/commonQuery.do?STOCK_TYPE=2&REG_PROVINCE=&CSRC_CODE=&STOCK_CODE=&sqlId=COMMON_SSE_CP_GPJCTPZ_GPLB_GP_L&COMPANY_STATUS=2,4,5,7,8&type=inParams&isPagination=true&pageHelp.cacheSize=1&pageHelp.beginPage=1&pageHelp.pageSize=500&pageHelp.pageNo=1&pageHelp.endPage=1";
const SSE_QUOTES = "https://yunhq.sse.com.cn:32042/v1/sh1/list/exchange/bshare?select=code,name,last,volume,tradephase&begin=0&end=500";
const SZSE_LIST = (page) => `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1110&TABKEY=tab2&PAGENO=${page}&random=${Math.random()}`;
const SZSE_QUOTE = (code) => `https://www.szse.cn/api/market/ssjjhq/getTimeData?marketId=1&code=${code}&random=${Math.random()}`;
const SZSE_HALTS = (code) => `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1798&TABKEY=tab1&txtDmorjc=${code}&random=${Math.random()}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function json(url, referer) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Referer: referer }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

function assetLines() {
  const byKey = new Map();
  const rows = parseCsv(fs.readFileSync(STOCKS, "utf8"));
  const head = rows[0];
  const t = head.indexOf("ticker");
  const i = head.indexOf("isin");
  const n = head.indexOf("name");
  for (const row of rows.slice(1)) {
    const ticker = row[t] || "";
    if (!/^(SSE:900|SZSE:20[01])\d{3}$/.test(ticker)) continue;
    byKey.set(ticker, [...(byKey.get(ticker) || []), { isin: (row[i] || "").toUpperCase(), name: clean(row[n]) }]);
  }
  return byKey;
}

function row(assets, exchange, mic, currency, code, name, raw) {
  const matches = assets.get(`${exchange}:${code}`) || [];
  const isins = [...new Set(matches.map((m) => m.isin).filter((isin) => ISIN.test(isin)))];
  const isin = isins.length === 1 ? isins[0] : "";
  const named = matches.find((m) => m.isin === isin && m.name);
  return { query: isin || code, ticker: code, name: named?.name || name, exchange, mic, currency, type: "STOCK", isin, raw };
}

async function shanghai(assets, leave) {
  const list = await json(SSE_LIST, "https://www.sse.com.cn/");
  const lines = list?.pageHelp?.data;
  if (!Array.isArray(lines)) throw new Error("SSE B-share list: no data");
  if (Number(list.pageHelp.total) !== lines.length) throw new Error(`SSE B-share list: ${lines.length} of ${list.pageHelp.total} lines read`);
  const quotes = await json(SSE_QUOTES, "https://www.sse.com.cn/");
  const phase = new Map((quotes?.list || []).map((q) => [q[0], String(q[4] || "")]));
  if (phase.size < LEAST.SSE) throw new Error(`SSE B-share quotes: ${phase.size} lines`);
  const rows = [];
  for (const line of lines) {
    const code = line.B_STOCK_CODE;
    if (!/^900\d{3}$/.test(code)) throw new Error(`SSE B-share list: code ${code}`);
    const name = clean(line.SEC_NAME_FULL || line.SEC_NAME_CN);
    if (line.DELIST_DATE && line.DELIST_DATE !== "-") { leave("delisted", `SSE:${code}`); continue; }
    if (!phase.has(code)) throw new Error(`SSE B-share ${code} ${name}: no quote on the B-share board`);
    const p = phase.get(code);
    if (p[0] === "P" || p[1] === "0") { leave("suspended", `SSE:${code}`); continue; }
    const english = clean(line.FULL_NAME_IN_ENGLISH);
    rows.push(row(assets, "SSE", "XSHG", "USD", code, english ? `${english} Class B` : name, [code, name, english, "SSE B-share", "USD"].filter(Boolean).join(" | ")));
  }
  if (rows.length < LEAST.SSE) throw new Error(`SSE B-shares: only ${rows.length} kept`);
  return { rows, date: quotes.date };
}

async function shenzhen(assets, leave) {
  const referer = "https://www.szse.cn/market/product/stock/list/index.html";
  const lines = [];
  let pages = 1;
  let total = 0;
  for (let page = 1; page <= pages; page += 1) {
    const tab = (await json(SZSE_LIST(page), referer)).find((t) => t?.metadata?.tabkey === "tab2");
    if (!tab || tab.metadata.name !== "B股列表") throw new Error("SZSE stock list: no B股列表 tab");
    pages = Number(tab.metadata.pagecount) || 1;
    total = Number(tab.metadata.recordcount) || 0;
    lines.push(...(tab.data || []));
    await sleep(500);
  }
  if (lines.length !== total) throw new Error(`SZSE B-share list: ${lines.length} of ${total} lines read`);
  const rows = [];
  for (const line of lines) {
    const code = clean(line.bgdm);
    if (!/^20[01]\d{3}$/.test(code)) throw new Error(`SZSE B-share list: code ${code}`);
    const name = clean(line.bgjc);
    const quote = await json(SZSE_QUOTE(code), "https://www.szse.cn/");
    if (quote?.code !== "0" || quote?.data?.code !== code) throw new Error(`SZSE B-share ${code} ${name}: no quote`);
    if (!(Number(quote.data.volume) > 0)) {
      const halts = (await json(SZSE_HALTS(code), "https://www.szse.cn/disclosure/deal/suspension/index.html"))[0]?.data || [];
      // newest notice first; a lifted suspension is either a resumption time
      // on the notice or a later "取消停牌" notice
      const latest = halts.find((h) => clean(h.zqdm) === code);
      if (latest && clean(latest.tpkssj) && !clean(latest.fpkssj) && clean(latest.tpsj) !== "取消停牌") { leave("suspended", `SZSE:${code}`); continue; }
    }
    rows.push(row(assets, "SZSE", "XSHE", "HKD", code, name, [code, name, line.bk, "SZSE B-share", "HKD"].filter(Boolean).join(" | ")));
    await sleep(200);
  }
  if (rows.length < LEAST.SZSE) throw new Error(`SZSE B-shares: only ${rows.length} kept`);
  return { rows, date: (await json(SZSE_QUOTE(rows[0].ticker), "https://www.szse.cn/")).datetime };
}

export async function bShareBook() {
  const assets = assetLines();
  const left = {};
  const leave = (reason, key) => (left[reason] = [...(left[reason] || []), key]);
  const sh = await shanghai(assets, leave);
  const sz = await shenzhen(assets, leave);
  return { rows: [...sh.rows, ...sz.rows], left, quotes: { SSE: sh.date, SZSE: sz.date } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, left, quotes } = await bShareBook();
  const by = rows.reduce((acc, r) => ((acc[`${r.exchange} ${r.currency}`] = (acc[`${r.exchange} ${r.currency}`] || 0) + 1), acc), {});
  console.log(`bShareBook: ${rows.length} rows ${JSON.stringify(by)}; quotes ${JSON.stringify(quotes)}; left out ${JSON.stringify(left)}`);
  console.log(`ISIN ${rows.filter((r) => r.isin).length}/${rows.length}; no ISIN: ${rows.filter((r) => !r.isin).map((r) => `${r.exchange}:${r.ticker}`).join(", ") || "none"}`);
}
