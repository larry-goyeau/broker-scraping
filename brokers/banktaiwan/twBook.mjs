// The Taiwan share book for the domestic-only Taiwanese brokers with no
// security list of their own (BankTaiwan Securities, Union Securities). Their
// clients order on the Taiwan Stock Exchange and the Taipei Exchange, so the
// book is what the two exchanges list today, read from the TWSE ISIN register
// (證券編碼分類查詢), one query per market and security class:
//
//   Taiwan Stock Exchange  股票, 創新板 (Taiwan Innovation Board), 特別股,
//                          臺灣存託憑證 (TDR), 受益證券-不動產投資信託 (REIT), ETF
//   Taipei Exchange        股票, 特別股, 臺灣存託憑證, 受益證券-不動產投資信託, ETF
//
// Shares, preferred shares, TDRs and REITs are STOCK; ETFs are ETF. Left out:
// warrants, ETNs, asset-backed beneficiary securities and bonds. The emerging
// board (興櫃), a separate negotiated market run by the Taipei Exchange, is
// added only for a broker that sells it (emerging: true): its shares and TDR
// are STOCK, on their own place. The register prints no
// currency: everything is in TWD except the foreign-currency lines of the
// dual-currency ETFs (code ending in K, named "+R" for renminbi or "+U" for
// dollars), which settle in that currency. A broker that settles only in TWD leaves them out
// (keepForeignLines false).
//
// Each scraper's evidence is read again first: the sentence the catalogue
// rests on must still be on the broker's page, or the run fails.
//
//   https://isin.twse.com.tw/isin/class_i.jsp?kind=1
//   https://isin.twse.com.tw/isin/class_main.jsp?market=1&issuetype=1

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const REGISTER = "https://isin.twse.com.tw/isin/class_main.jsp";

const TWSE = { exchange: "Taiwan Stock Exchange", mic: "XTAI" };
const TPEX = { exchange: "Taipei Exchange", mic: "ROCO" };
const EMERGING = { exchange: "Taipei Exchange Emerging Stock Board", mic: "" };
const EMERGING_KINDS = new Set(["股票", "臺灣存託憑證"]);

// [market, issuetype, place, type, class as the register prints it, floor]
const CLASSES = [
  ["1", "1", TWSE, "STOCK", "股票", 900],
  ["C", "C", TWSE, "STOCK", "創新板", 10],
  ["1", "A", TWSE, "STOCK", "特別股", 10],
  ["1", "J", TWSE, "STOCK", "臺灣存託憑證(TDR)", 3],
  ["1", "N", TWSE, "STOCK", "受益證券-不動產投資信託", 3],
  ["1", "I", TWSE, "ETF", "ETF", 150],
  ["2", "4", TPEX, "STOCK", "股票", 700],
  ["2", "A", TPEX, "STOCK", "特別股", 0],
  ["2", "J", TPEX, "STOCK", "臺灣存託憑證", 0],
  ["2", "N", TPEX, "STOCK", "受益證券-不動產投資信託", 0],
  ["2", "3", TPEX, "ETF", "ETF", 60],
];

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getBytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(last || url);
}

function decode(bytes) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("big5").decode(bytes) : utf8;
}

export async function getText(url) {
  return decode(await getBytes(url));
}

// The page's words, without tags, scripts or entities.
export function pageWords(html) {
  return String(html)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/​/g, "")
    .replace(/\s+/g, " ");
}

async function registerClass(market, issuetype) {
  const query = new URLSearchParams({ owncode: "", stockname: "", isincode: "", market, issuetype, industry_code: "", Page: "1", chklike: "Y" });
  const html = await getText(`${REGISTER}?${query}`);
  const lines = [];
  for (const tr of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => pageWords(cell[1]).trim());
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(cells[1] || "")) continue;
    // 頁面編號, 國際證券編碼, 有價證券代號, 有價證券名稱, 市場別, 有價證券別, 產業別, 上市日, CFICode, 備註
    lines.push({ isin: cells[1], code: cells[2], name: cells[3], market: cells[4], kind: cells[5], industry: cells[6], listed: cells[7], cfi: cells[8] });
  }
  return lines;
}

export function isForeignLine(line) {
  return /^\d{5}K$/.test(line.code);
}

// evidence: [{ url, pattern }]; out: URL of the parsed.json.
export async function writeTwBook({ broker, out, evidence, keepForeignLines = false, emerging = false }) {
  for (const { url, pattern } of evidence) {
    if (!pattern.test(pageWords(await getText(url)))) throw new Error(`${url} no longer says ${pattern} (${broker})`);
  }
  const rows = [];
  const seen = new Set();
  const counts = new Map();
  const foreign = [];
  for (const [market, issuetype, place, type, kind, floor] of CLASSES) {
    const lines = await registerClass(market, issuetype);
    if (lines.length < floor) throw new Error(`${place.exchange} ${kind}: the register gave ${lines.length} lines`);
    for (const line of lines) {
      if (line.kind !== kind) throw new Error(`${line.code} is ${line.kind}, asked for ${kind}`);
      if (!/^[0-9]{4,6}[A-Z]?[0-9]?$/.test(line.code)) throw new Error(`unreadable code ${line.code} (${line.name})`);
      if (isForeignLine(line) && !keepForeignLines) {
        foreign.push(line.code);
        continue;
      }
      const key = `${place.mic}|${line.code}`;
      if (seen.has(key)) throw new Error(`repeated ${key}`);
      seen.add(key);
      rows.push({
        query: line.isin,
        ticker: line.code,
        name: line.name,
        exchange: place.exchange,
        mic: place.mic,
        currency: "TWD",
        type,
        isin: line.isin,
        raw: [line.code, line.name, place.exchange, "TWD", type, line.kind, line.industry].filter(Boolean).join(" "),
      });
      const tally = `${place.exchange} ${type}`;
      counts.set(tally, (counts.get(tally) || 0) + 1);
    }
  }
  if (emerging) {
    const lines = await registerClass("E", "");
    if (lines.length < 250) throw new Error(`emerging board: the register gave ${lines.length} lines`);
    for (const line of lines) {
      if (line.market !== "興櫃") throw new Error(`${line.code} is on ${line.market}, asked for 興櫃`);
      if (!EMERGING_KINDS.has(line.kind)) throw new Error(`${line.code} is ${line.kind} on the emerging board`);
      const key = `ESB|${line.code}`;
      if (seen.has(key)) throw new Error(`repeated ${key}`);
      seen.add(key);
      rows.push({
        query: line.isin,
        ticker: line.code,
        name: line.name,
        exchange: EMERGING.exchange,
        mic: EMERGING.mic,
        currency: "TWD",
        type: "STOCK",
        isin: line.isin,
        raw: [line.code, line.name, EMERGING.exchange, "TWD", "STOCK", line.kind, line.industry].filter(Boolean).join(" "),
      });
      counts.set(`${EMERGING.exchange} STOCK`, (counts.get(`${EMERGING.exchange} STOCK`) || 0) + 1);
    }
  }
  // The book must keep the big names; a broken read fails here.
  for (const [mic, ticker] of [["XTAI", "2330"], ["XTAI", "0050"], ["ROCO", "6488"], ["ROCO", "00679B"]]) {
    if (!seen.has(`${mic}|${ticker}`)) throw new Error(`${ticker} is missing from the ${mic} book`);
  }
  rows.sort((a, b) => a.type.localeCompare(b.type) || a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
  const kept = stampRows(withoutObligations(rows));
  if (kept.length !== rows.length) throw new Error(`${rows.length - kept.length} lines were taken for bonds`);
  fs.writeFileSync(out, JSON.stringify(kept, null, 2));
  const tallies = [...counts].map(([label, count]) => `${count} ${label}`).join(", ");
  console.error(`${broker}: ${kept.length} listings (${tallies})${foreign.length ? `; left out the foreign-currency ETF lines ${foreign.join(", ")}` : ""}`);
  return kept;
}
