// The Shanghai and Shenzhen A-shares and ETFs a Hong Kong broker's client
// can buy and sell through Northbound Stock Connect today, for the Hong Kong
// brokers that sell Stock Connect and publish no list of their own
// (bocomhk, ccbi, centralchinahk, citibankhk).
//
// The list is HKEX's own: "List of SSE Securities/China Connect Securities
// (eligible for both buy and sell)" and the SZSE one, reissued every
// Northbound trading day ("For the following Northbound trading day"). The
// "Special" lists (sell only: shares dropped from the eligible indices,
// risk-alert shares, ...) are not read. Instrument type EQTY is a share
// (STOCK), TRST an exchange-traded fund (ETF); there is no other type in
// the lists. One row per SSE / SZSE code, in yuan (Stock Connect trades and
// settles A-shares in RMB), exchange SSE / SZSE as in ../hsbchk and
// ../brightsmart.
//
//   https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities
//   https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities/SSE_Securities.csv
//   https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities/SZSE_Securities.csv
//   (UTF-16 tab-separated text; the .xls files beside them hold the same)
//
// Each row carries `board`: "STAR" for SSE shares 688xxx/689xxx (STAR
// Market) and "ChiNext" for SZSE shares 300xxx-302xxx. Northbound trading
// in those shares is for institutional professional investors only (HKEX
// rule); the broker scraper decides whether it drops them (a broker that
// says it does not offer the board) or keeps them with a remark. ETFs that
// track STAR or ChiNext indices (588xxx, 159xxx) are fund-board lines, not
// those boards.
//
// Suspensions: HKEX reissues the lists each Northbound day, and no current
// suspension list of SSE or SZSE could be read reliably (SSE's 停复牌 feed
// still shows 2025 suspensions long lifted), so no A-share line is dropped
// as suspended.
//
// ISIN and full name come from ../../assets/stocks.csv / etfs.csv
// (SSE:<code>, SZSE:<code>) when one line matches; otherwise HKEX's name
// and no ISIN (query is then the code).
//
// Use:
//   import { connectBook } from "../bocomhk/connectBook.mjs";
//   const { rows, updated } = await connectBook();
//
//   node brokers/bocomhk/connectBook.mjs     prints the counts

import fs from "node:fs";
import { parseCsv } from "../jtrust/jp_listings.mjs";

const BASE = "https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities";
export const CONNECT_LISTS = [
  { exchange: "SSE", mic: "XSHG", url: `${BASE}/SSE_Securities.csv`, least: 1500 },
  { exchange: "SZSE", mic: "XSHE", url: `${BASE}/SZSE_Securities.csv`, least: 1700 },
];
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const TYPE = { EQTY: "STOCK", TRST: "ETF" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function fetchBytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

function decode(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return bytes.toString("utf8");
}

export function boardOf(exchange, code, type) {
  if (type !== "STOCK") return "";
  if (exchange === "SSE" && /^68[89]/.test(code)) return "STAR";
  if (exchange === "SZSE" && /^30[0-2]/.test(code)) return "ChiNext";
  return "";
}

function assetLines() {
  const byKey = new Map();
  for (const file of [STOCKS, ETFS]) {
    if (!fs.existsSync(file)) continue;
    const rows = parseCsv(fs.readFileSync(file, "utf8"));
    const head = rows[0];
    const t = head.indexOf("ticker");
    const i = head.indexOf("isin");
    const n = head.indexOf("name");
    for (const row of rows.slice(1)) {
      const ticker = row[t] || "";
      if (!/^(SSE|SZSE):\d{6}$/.test(ticker)) continue;
      byKey.set(ticker, [...(byKey.get(ticker) || []), { isin: (row[i] || "").toUpperCase(), name: clean(row[n]) }]);
    }
  }
  return byKey;
}

export async function connectBook() {
  const assets = assetLines();
  const rows = [];
  const updated = {};
  for (const list of CONNECT_LISTS) {
    const lines = decode(await fetchBytes(list.url)).split(/\r?\n/).map((line) => line.split("\t").map(clean));
    const title = lines[0]?.[0] || "";
    if (!/eligible for both buy and sell/i.test(title)) throw new Error(`${list.url}: title is now "${title}"`);
    updated[list.exchange] = (lines.find((line) => /^Updated:/i.test(line[0] || "")) || [""])[0].replace(/^Updated:\s*/i, "");
    const at = lines.findIndex((line) => line[0] === "No.");
    if (at < 0) throw new Error(`${list.url}: no header line`);
    const head = lines[at];
    const col = (pattern) => {
      const index = head.findIndex((cell) => pattern.test(cell));
      if (index < 0) throw new Error(`${list.url}: no column ${pattern}`);
      return index;
    };
    const c = { code: col(/^S[HZ]?SE Stock Code$/i), name: col(/^Name$/i), type: col(/^Instrument Type$/i) };
    let count = 0;
    for (const line of lines.slice(at + 1)) {
      const code = line[c.code] || "";
      if (!/^\d{6}$/.test(code)) continue;
      const kind = (line[c.type] || "").toUpperCase();
      const type = TYPE[kind];
      if (!type) throw new Error(`${list.exchange} ${code}: unknown instrument type ${kind}`);
      const matches = assets.get(`${list.exchange}:${code}`) || [];
      const isins = [...new Set(matches.map((m) => m.isin).filter((isin) => ISIN.test(isin)))];
      const isin = isins.length === 1 ? isins[0] : "";
      const named = matches.find((m) => m.isin === isin && m.name);
      rows.push({
        query: isin || code,
        ticker: code,
        name: named?.name || line[c.name],
        exchange: list.exchange,
        mic: list.mic,
        currency: "CNY",
        type,
        isin,
        raw: [code, line[c.name], kind, "Northbound buy and sell"].join(" | "),
        board: boardOf(list.exchange, code, type),
      });
      count += 1;
    }
    if (count < list.least) throw new Error(`${list.exchange} Northbound list has ${count} lines`);
    await sleep(1000);
  }
  return { rows, updated, urls: CONNECT_LISTS.map((list) => list.url) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, updated } = await connectBook();
  const by = (key) => rows.reduce((acc, row) => ((acc[key(row)] = (acc[key(row)] || 0) + 1), acc), {});
  console.log(`connectBook: ${rows.length} rows, lists updated ${JSON.stringify(updated)}`);
  console.log("by place and type", by((row) => `${row.exchange} ${row.type}`), "by board", by((row) => row.board || "main"));
  console.log(`ISIN ${rows.filter((row) => row.isin).length}/${rows.length}; no ISIN: ${rows.filter((row) => !row.isin).map((row) => `${row.exchange}:${row.ticker}`).join(", ") || "none"}`);
}
