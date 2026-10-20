// What VPBank Securities (VPBankS) sells in shares and exchange-traded
// funds, with no login. The public NEO Invest price board is the book. Its
// HOSE, HNX and UPCOM tabs each load one floor's whole share list from the
// board's own JSON service (stockDetail with marketCode and stockType ST),
// and its ETF tab loads every fund the same way (stockType EF). Each line
// names its floor (marketCode HOSE, HNX or UPCOM) and carries today's
// trading date and reference price.
//
// Rules:
// - Shares (ST) on HOSE, HNX and UPCOM are written as STOCK. Suspended or
//   restricted lines stay: they are still on the board.
// - A fund (EF) named "Quỹ ETF …" is written as ETF. The other EF lines
//   are closed-end fund certificates (FUC…, e.g. FUCVREIT), which are not
//   shares and are not written.
// - Covered warrants, bonds and futures are other products and are not
//   read (the board serves them under other stock types).
// - A line with no reference price has no session today and is not
//   written. The board's master symbol list (stockList) still carries
//   delisted names and expired warrants, so it is not the book.
// - The board prints no ISIN; the Vietnamese number is built from the
//   ticker. The shared rules (ISIN, mic, floors, minimum counts) are in
//   ../vix/vnboard.mjs. Prices are in VND.
//
// The service and the site are behind a Cloudflare bot check that refuses
// a plain fetch (403), so the list is read inside a real Chrome: start
// Chrome with --remote-debugging-port=9222 (a separate --user-data-dir),
// and this script opens the price board in it and calls the service from
// the board's own page.
//
//   https://neoinvest.vpbanks.com.vn/stock-trade/priceboard
//   https://neopro.vpbanks.com.vn/neo-inv-tools/noauth/public/v1/stock/stockDetail?marketCode=HOSE&stockType=ST&pageNo=1&pageSize=5000
//   (also marketCode=HNX and marketCode=UPCOM; and stockType=EF alone for the ETF tab)
//
// Fees (published, not used here): 0.1% self-directed, exchange fee
// included, from 01/07/2025:
//   https://www.vpbanks.com.vn/ho-tro?category=bieu-phi-dich-vu
//
//   node brokers/vpbanks/vpbanks_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { boardOf, clean, finish, fundType, isClosedEnd, pause, tally } from "../vix/vnboard.mjs";

const BOARD = "https://neoinvest.vpbanks.com.vn/stock-trade/priceboard";
const SERVICE = "https://neopro.vpbanks.com.vn/neo-inv-tools/noauth/public/v1/stock/stockDetail";
const CALLS = [
  { query: "marketCode=HOSE&stockType=ST", exchange: "HOSE", kind: "ST" },
  { query: "marketCode=HNX&stockType=ST", exchange: "HNX", kind: "ST" },
  { query: "marketCode=UPCOM&stockType=ST", exchange: "UPCOM", kind: "ST" },
  { query: "stockType=EF", exchange: "", kind: "EF" },
];

// Runs in the board's page: one call, with retries, returning the lines.
async function readCall(page, url) {
  return page.evaluate(async (address) => {
    let last = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch(address, { headers: { Accept: "application/json, text/plain, */*" } });
        const text = await response.text();
        if (!response.ok) last = `${response.status} ${address}`;
        else {
          const body = JSON.parse(text);
          if (body?.status === 1 && Array.isArray(body.data?.content)) return body.data.content;
          last = `${address} answered ${body?.code || "no code"} ${body?.message || ""}`;
        }
      } catch (error) {
        last = `${error.message || error} ${address}`;
      }
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
    throw new Error(last);
  }, url);
}

let browser;
try {
  browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null, protocolTimeout: 120_000 });
} catch (error) {
  throw new Error(`no Chrome on http://127.0.0.1:9222 (start it with --remote-debugging-port=9222): ${error.message}`);
}
const page = await browser.newPage();
const lists = [];
try {
  await page.goto(BOARD, { waitUntil: "domcontentloaded", timeout: 90_000 });
  // Let the bot check finish and the board's own first calls run.
  for (let wait = 0; wait < 30 && !/neoinvest\.vpbanks\.com\.vn/.test(page.url()); wait += 1) await pause(1000);
  await pause(4000);
  for (const call of CALLS) lists.push({ ...call, lines: await readCall(page, `${SERVICE}?${call.query}&pageNo=1&pageSize=5000`) });
} finally {
  await page.close();
  await browser.disconnect();
}

const lines = [];
const leftOut = new Map();
for (const { exchange: asked, kind: askedKind, lines: list } of lists) {
  if (!list.length) throw new Error(`the ${asked || "ETF"} ${askedKind} call is empty`);
  for (const line of list) {
    const ticker = clean(line.symbol).toUpperCase();
    const name = clean(line.stockName);
    const exchange = boardOf(line.marketCode);
    const kind = clean(line.stockType).toUpperCase();
    if (!ticker) throw new Error(`a line has no symbol: ${JSON.stringify(line).slice(0, 120)}`);
    if (!exchange) throw new Error(`${ticker} is on market ${line.marketCode || "none"}`);
    if (asked && exchange !== asked) throw new Error(`${ticker} is market ${line.marketCode} on the ${asked} call`);
    if (kind !== askedKind) throw new Error(`${ticker} is stock type ${kind || "none"} on the ${askedKind} call`);
    if (!(Number(line.refPrice) > 0)) {
      tally(leftOut, "lines with no reference price");
      continue;
    }
    let type = "STOCK";
    if (kind === "EF") {
      if (isClosedEnd(name, ticker) || !fundType(name)) {
        tally(leftOut, "closed-end funds");
        continue;
      }
      type = "ETF";
    }
    lines.push({ ticker, name, exchange, type });
  }
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("vpbanks-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
