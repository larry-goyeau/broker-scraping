// What SSI sells in shares and exchange-traded funds, with no login.
// The public price board is the book. Each line names its board and a
// type. Shares are s and funds are e. Covered warrants, bonds, futures,
// indexes and unit trusts are other products and are not written. A
// delisted line is not in this file. The board's own host answers a
// browser and refuses a plain request, so this script asks through Chrome.
// The three board lists are a check: Ho Chi Minh must be the shares plus
// the unit trusts, and the other two boards must be the shares.
//
//   https://iboard-query.ssi.com.vn/stock/stock-info
//   https://iboard-query.ssi.com.vn/stock/exchange/hose
//
//   node brokers/ssi/ssi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const LIST = "https://iboard-query.ssi.com.vn/stock/stock-info";
const BOARD = "https://iboard-query.ssi.com.vn/stock/exchange/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SOLD = { s: "STOCK", e: "ETF" };
const LEFT_OUT = {
  w: "covered warrants",
  b: "bonds",
  f: "futures",
  i: "indexes",
  m: "unit trusts",
};
const BOARDS = ["HOSE", "HNX", "UPCOM"];

function rowsOf(body, url) {
  const rows = Array.isArray(body) ? body : body?.data;
  if (!Array.isArray(rows)) throw new Error(`${url} is not a list`);
  return rows;
}

async function getJson(page, url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (response?.ok()) return JSON.parse(await response.text());
      last = `${response ? response.status() : "no response"} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

if (!fs.existsSync(CHROME)) throw new Error(`Chrome is not at ${CHROME}`);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"] });

try {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  );
  const book = rowsOf(await getJson(page, LIST), LIST);
  if (!book.length) throw new Error(`${LIST} has no listings`);

  const rows = [];
  const seen = new Set();
  const leftOut = new Map();
  const aside = { HOSE: [], HNX: [], UPCOM: [] };
  for (const line of book) {
    const kind = String(line.type || "").trim().toLowerCase();
    const type = SOLD[kind];
    const ticker = String(line.symbol || line.code || "").trim().toUpperCase();
    const exchange = String(line.exchange || "").trim().toUpperCase();
    if (!type) {
      if (!LEFT_OUT[kind]) throw new Error(`unknown type ${kind || "unmarked"} on ${ticker || line.symbol}`);
      leftOut.set(kind, (leftOut.get(kind) || 0) + 1);
      if (kind === "m") {
        if (!BOARDS.includes(exchange)) throw new Error(`${ticker} is on ${exchange || "no board"}`);
        aside[exchange].push(ticker);
      }
      continue;
    }
    const name = String(line.clientName || line.clientNameEn || "").replace(/\s+/g, " ").trim();
    const isin = String(line.isin || "").trim().toUpperCase();
    if (!ticker || !name) throw new Error(`unreadable listing ${JSON.stringify(line.symbol)}`);
    if (!BOARDS.includes(exchange)) throw new Error(`${ticker} is on ${exchange || "no board"}`);
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
    if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    seen.add(isin);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency: "VND",
      type,
      isin,
      raw: [ticker, name, exchange, isin, type].join(" "),
    });
  }

  for (const board of BOARDS) {
    const url = `${BOARD}${board.toLowerCase()}`;
    const listed = new Set(
      rowsOf(await getJson(page, url), url).map((line) => String(line.stockSymbol || "").trim().toUpperCase()).filter(Boolean)
    );
    const sold = new Set([
      ...rows.filter((row) => row.exchange === board && row.type === "STOCK").map((row) => row.ticker),
      ...aside[board],
    ]);
    const extra = [...listed].filter((code) => !sold.has(code));
    const missing = [...sold].filter((code) => !listed.has(code));
    if (extra.length || missing.length) {
      throw new Error(`${board} does not match the book: extra ${extra.slice(0, 8).join(", ") || "none"}; missing ${missing.slice(0, 8).join(", ") || "none"}`);
    }
  }

  rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
  fs.writeFileSync(new URL("ssi-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

  const byType = new Map();
  for (const row of rows) byType.set(row.type, (byType.get(row.type) || 0) + 1);
  const skipped = [...leftOut].map(([kind, count]) => `${count} ${LEFT_OUT[kind]}`).join(", ");
  console.error(
    `${rows.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). Left out: ${skipped || "none"}.`
  );
} finally {
  await browser.close();
}
