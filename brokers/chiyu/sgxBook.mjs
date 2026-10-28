// Every share, REIT, business trust, depositary receipt and exchange-traded
// fund that can be bought on the Singapore Exchange today, for a broker that
// sells Singapore securities and publishes no list (../chiyu).
//
// The list is SGX's own securities feed (the one behind sgx.com's
// securities prices page), one line per counter, with its type, board,
// trading currency and status:
//
//   https://api.sgx.com/securities/v1.1?excludetypes=bonds
//
// Kept: "stocks" (Mainboard, Catalist and GlobalQuote shares), "reits",
// "businesstrusts", "adrs" (SGX's SDRs and GDRs, type STOCK), "etfs" and
// "liprod" (leveraged and inverse products, type ETF), and "others"
// (listed investment companies and funds: Global Investments B73 as a share,
// a name with "Fund" as ETF) except the rights lines SGX marks ICT. Left
// out: company warrants, structured warrants, daily leverage certificates
// and listed certificates (not shares or ETFs), bonds (excluded in the
// call), and the lines whose status (`i`) is SUSP (suspended) or PL
// (pre-listing, not trading yet). A trading halt (H) is kept.
//
// ISIN: SGX's daily ISIN file (name, ISIN, counter code), the latest of the
// last ten days; the address answers with a redirect to the file:
//
//   https://links.sgx.com/1.0.0/isin/1/<DD Mon YYYY>
//
// Currency: the counter's own (SGD, USD and the other dual-currency lines
// are separate counters with their own code). Exchange "SGX", MIC XSES.
//
// Use:
//   import { sgxBook } from "../chiyu/sgxBook.mjs";
//   const { rows, dropped, isinDay } = await sgxBook();
//
//   node brokers/chiyu/sgxBook.mjs      prints the counts

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const FEED = "https://api.sgx.com/securities/v1.1?excludetypes=bonds";
const ISIN_FILE = "https://links.sgx.com/1.0.0/isin/1/";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", Origin: "https://www.sgx.com", Referer: "https://www.sgx.com/" };
const KEEP = { stocks: "STOCK", reits: "STOCK", businesstrusts: "STOCK", adrs: "STOCK", etfs: "ETF", liprod: "ETF", others: "STOCK" };
const NOT_TRADING = { SUSP: "suspended", PL: "pre-listing, not trading yet" };
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

async function isinFile() {
  for (let back = 0; back < 10; back += 1) {
    const day = new Date(Date.now() + 8 * 3600_000 - back * 86_400_000);
    const label = `${String(day.getUTCDate()).padStart(2, "0")} ${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
    const body = await text(ISIN_FILE + encodeURIComponent(label)).catch(() => "");
    const lines = body.split(/\r?\n/);
    if (!/ISIN CODE/.test(lines[0] || "") || lines.length < 1000) continue;
    const head = lines[0];
    const isinAt = head.indexOf("ISIN CODE");
    const codeAt = head.indexOf("CODE", isinAt + "ISIN CODE".length);
    const counterAt = head.indexOf("TRADING COUNTER NAME");
    const statusAt = head.indexOf("STATUS");
    if (statusAt < 0 || isinAt < 0 || codeAt < 0 || counterAt < 0) throw new Error(`the SGX ISIN file header is ${head}`);
    const byCode = new Map();
    for (const line of lines.slice(1)) {
      const isin = clean(line.slice(isinAt, codeAt)).toUpperCase();
      const code = clean(line.slice(codeAt, counterAt));
      if (code && ISIN.test(isin)) byCode.set(code, { isin, name: clean(line.slice(0, statusAt)) });
    }
    return { byCode, day: label };
  }
  throw new Error("no SGX ISIN file in the last ten days");
}

export async function sgxBook() {
  const feed = JSON.parse(await text(FEED))?.data?.prices || [];
  if (feed.length < 1000) throw new Error(`the SGX feed has ${feed.length} lines`);
  const isins = await isinFile();
  const rows = [];
  const dropped = [];
  const outOfScope = {};
  for (const line of feed) {
    const code = clean(line.nc);
    if (!code) continue;
    const type = KEEP[line.type];
    if (!type) { outOfScope[line.type] = (outOfScope[line.type] || 0) + 1; continue; }
    const name = clean(line.n);
    const drop = (reason) => dropped.push({ ticker: code, name, reason });
    if (NOT_TRADING[line.i]) { drop(NOT_TRADING[line.i]); continue; }
    if (line.type === "others" && (line.i === "ICT" || /\bR\d?$/.test(name))) { drop("rights"); continue; }
    const found = isins.byCode.get(code);
    rows.push({
      query: found?.isin || code,
      ticker: code,
      name: found?.name || name,
      exchange: "SGX",
      mic: "XSES",
      currency: clean(line.cur).toUpperCase() || "SGD",
      type: line.type === "others" && /\bfund\b/i.test(`${name} ${found?.name || ""}`) ? "ETF" : type,
      isin: found?.isin || "",
      raw: [code, name, line.type, line.m, line.cur, line.i ? `status ${line.i}` : ""].filter(Boolean).join(" | "),
    });
  }
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  for (const [ticker, type] of [["D05", "STOCK"], ["C38U", "STOCK"], ["ES3", "ETF"]]) {
    if (rows.find((row) => row.ticker === ticker)?.type !== type) throw new Error(`SGX ${ticker} should be a ${type} row`);
  }
  if (rows.length < 700) throw new Error(`only ${rows.length} SGX lines kept`);
  return { rows, dropped, outOfScope, isinDay: isins.day, urls: [FEED, ISIN_FILE + encodeURIComponent(isins.day)] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const book = await sgxBook();
  const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});
  console.log(`sgxBook: ${book.rows.length} rows, ISIN file ${book.isinDay}`);
  console.log("by type", tally(book.rows, (row) => row.type), "by currency", tally(book.rows, (row) => row.currency));
  console.log(`ISIN ${book.rows.filter((row) => row.isin).length}; no ISIN: ${book.rows.filter((row) => !row.isin).map((row) => `${row.ticker} ${row.name}`).join(", ") || "none"}`);
  console.log("dropped", tally(book.dropped, (item) => item.reason), "out of scope", book.outOfScope);
}
