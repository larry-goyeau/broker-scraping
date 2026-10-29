// The Trinidad and Tobago Stock Exchange book, shared by the scrapers of
// TTSE member brokers that sell the whole exchange (first used by Republic
// Wealth Management).
//
// The TTSE Daily Market Quote is the price board: one table per market
// (Ordinary Shares, Preference Shares, Second Tier Shares, SME Shares,
// Mutual Fund Shares, USD Equity Shares), each row a symbol link whose
// title is the security's name, with the last sale date. A suspended line
// stays on the board with " (S)" after its symbol (the legend reads
// "(S) Suspended"); it is dropped. The Listed Securities page carries the
// exchange's own list (status A Active, D Suspended, I De-Listed); a board
// line it calls suspended is dropped too, a board line it calls de-listed
// stops the read, and a line it calls active but that is not on the board is
// left out and printed. A line with no last sale date (never traded) is
// dropped.
//
// The bond boards are not read. A right would sit in a "RIGHTS" segment;
// none is on the board. Ordinary and preference shares are STOCK. The two
// Eppley Caribbean Property Fund cells (CPFD, CPFV) on the Mutual Fund
// board are closed-end fund shares traded on the exchange: FUND. A suspended
// fund (CALYP, the Calypso Macro Index Fund) is dropped like a share.
// The USD Equity board trades in USD; every other board in TTD.
//
// ISINs: the TTSE prints none (neither the board, the list nor the stock
// pages), and assets/stocks.csv has no TTSE line. The ISINs below are the
// ones the Jamaica Stock Exchange listed-companies page prints for the same
// securities, cross-listed there (read 2026-10-25, see
// brokers/jmmb/jamaicaBook.mjs). Every other row has isin "".
//
//   https://www.stockex.co.tt/market-quote/
//   https://www.stockex.co.tt/listed-securities/
//   https://www.jamstockex.com/listings/listed-companies/?market=31   (49 USD)
//
// The site sits behind a Sucuri firewall: a browser User-Agent is needed,
// and www.stockex.co.tt/fetch_calls/* is refused; the two pages above are
// plain HTML. Since October 2026 the firewall answers curl with a
// JavaScript challenge some days; with CHROME_URL=http://127.0.0.1:9222 the
// two pages are read in a local Chrome started with
// --remote-debugging-port=9222 instead (as ../ccbolsa reads its exchange),
// which the firewall lets through. Nothing here solves a captcha.
//
// Use:
//   import { ttseBook } from "../republicwealth/ttseBook.mjs";
//   const rows = await ttseBook();                         // every board
//   const rows = await ttseBook({ boards: ["Ordinary Shares", "SME Shares"] });
// Rows have the house shape (query, ticker, name, exchange, currency, type,
// isin, mic, raw); the caller still runs withoutObligations and stampRows.
// The drops are printed on stderr and kept on rows.dropped.
//
//   node brokers/republicwealth/ttseBook.mjs     (prints the counts)

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const BOARD = "https://www.stockex.co.tt/market-quote/";
const LIST = "https://www.stockex.co.tt/listed-securities/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
export const EXCHANGE = "Trinidad and Tobago Stock Exchange";
export const MIC = "XTRN";

// Board title, row type, currency, fewest lines before the page is taken
// as broken.
export const BOARDS = [
  { name: "Ordinary Shares", type: "STOCK", currency: "TTD", least: 20 },
  { name: "Preference Shares", type: "STOCK", currency: "TTD", least: 0 },
  { name: "Second Tier Shares", type: "STOCK", currency: "TTD", least: 0 },
  { name: "SME Shares", type: "STOCK", currency: "TTD", least: 3 },
  { name: "Mutual Fund Shares", type: "FUND", currency: "TTD", least: 0 },
  { name: "USD Equity Shares", type: "STOCK", currency: "USD", least: 0 },
];

// TTSE symbol -> [ISIN, JSE symbol, a word of the JSE name], from the JSE
// listed-companies page (same security cross-listed in Kingston).
const CROSS_LISTED = new Map([
  ["ASBH", ["JME202300088", "ASBH", "BRYDEN"]],
  ["ASBH6.00", ["JME202300112", "ASBH6.00", "BRYDEN"]],
  ["GHL", ["TTP501551035", "GHL", "GUARDIAN"]],
  ["GKC", ["JMP4897P1050", "GK", "GRACEKENNEDY"]],
  ["JMMBGL", ["JME201400020", "JMMBGL", "JMMB"]],
  ["MASSY", ["TTP710771044", "MASSY", "MASSY"]],
  ["MPCCEL", ["TTE000000116", "MPCCEL", "MPC"]],
  ["NCBFG", ["JME201700064", "NCBFG", "NCB"]],
]);
const MOST_SUSPENDED = 8;
const MOST_OFF_BOARD = 4;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A page as the local Chrome renders it (CHROME_URL), after the firewall's
// own script has run.
async function chromeText(url) {
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: process.env.CHROME_URL, defaultViewport: null });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
    for (let wait = 0; wait < 30 && /sucuri|access denied|captcha/i.test(await page.title()); wait += 1) await pause(1000);
    const html = await page.content();
    if (/Sucuri WebSite Firewall - Access Denied/.test(html)) throw new Error(`the TTSE firewall refused ${url} in the local Chrome`);
    return html;
  } finally {
    await page.close().catch(() => {});
    browser.disconnect();
  }
}

async function getText(url) {
  if (process.env.CHROME_URL) return chromeText(url);
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "30", "-A", UA, url], { maxBuffer: 32_000_000, encoding: "utf8" });
      if (/Sucuri WebSite Firewall - Access Denied/.test(stdout)) throw new Error(`the TTSE firewall refused ${url}`);
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await pause(1000 * (attempt + 1));
  }
  throw new Error(last || url);
}

function text(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;|&#0?38;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0?39;|&#8217;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[​]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The board: each market is an Elementor toggle whose title names it, then
// a table of rows. Returns [{ board, ticker, name, suspended, lastSale }].
function boardLines(html) {
  if (!/\(S\)\s*Suspended/.test(text(html))) throw new Error("the TTSE board legend no longer says (S) is Suspended");
  const titles = [...html.matchAll(/class="elementor-toggle-title"[^>]*>([^<]*)<\/a>/g)].map((match) => ({
    name: text(match[1]),
    at: match.index,
  }));
  const lines = [];
  for (const board of BOARDS) {
    const index = titles.findIndex((title) => title.name === board.name);
    if (index < 0) throw new Error(`the TTSE board has no "${board.name}" table`);
    const body = html.slice(titles[index].at, titles[index + 1]?.at ?? html.indexOf("PUT THROUGH TRANSACTIONS"));
    if (!/<th[^>]*>Last Sale Date<\/th>/.test(body) && /manage-stock\//.test(body)) throw new Error(`${board.name}: columns changed`);
    let count = 0;
    for (const [, row] of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      // The title is not escaped (L.J. WILLIAMS LIMITED, "A") and a new
      // line may have an empty href (MED).
      const link = row.match(/<a title="(.*?)" href="(?:https:\/\/www\.stockex\.co\.tt\/manage-stock\/[^/"]+\/)?">([\s\S]*?)<\/a>/);
      if (!link) {
        if (/<a\b/.test(row)) throw new Error(`${board.name}: unreadable row ${text(row).slice(0, 60)}`);
        continue;
      }
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => text(match[1]));
      if (cells.length !== 14) throw new Error(`${board.name}: row ${text(link[2])} has ${cells.length} cells`);
      const shown = text(link[2]);
      const parts = shown.match(/^(\S+)(?:\s+(.*))?$/);
      const ticker = parts[1].toUpperCase();
      const mark = parts[2] || "";
      if (mark && !/^(\((S|XD|XR|XC)\)\s*)+$/.test(mark)) throw new Error(`${board.name}: ${ticker} carries an unknown mark "${mark}"`);
      const lastSale = cells[10];
      if (lastSale && !/^\d{2}-\d{2}-\d{4}$/.test(lastSale)) throw new Error(`${ticker}: last sale date "${lastSale}"`);
      lines.push({ board, ticker, name: text(link[1]), suspended: /\(S\)/.test(mark), lastSale });
      count += 1;
    }
    if (count < board.least) throw new Error(`${board.name}: only ${count} lines`);
  }
  return lines;
}

// The Listed Securities page: the `equities` array its Vue app renders.
function listedSecurities(html) {
  const match = html.match(/var equities = (\[[\s\S]*?\]);\s*var bonds/);
  if (!match) throw new Error("the TTSE listed-securities page no longer carries its equities list");
  const list = JSON.parse(match[1]);
  if (list.length < 30) throw new Error(`only ${list.length} TTSE listed equities`);
  const bySymbol = new Map();
  for (const item of list) {
    const ticker = text(item.icode).toUpperCase();
    if (!["A", "D", "I"].includes(item.status)) throw new Error(`${ticker} has status ${item.status}`);
    bySymbol.set(ticker, { ticker, name: text(item.iname), status: item.status, segment: text(item.segment) });
  }
  return bySymbol;
}

export async function ttseBook({ boards = BOARDS.map((board) => board.name), quiet = false } = {}) {
  const unknownBoard = boards.filter((name) => !BOARDS.some((board) => board.name === name));
  if (unknownBoard.length) throw new Error(`unknown TTSE board ${unknownBoard.join(", ")}`);
  const lines = boardLines(await getText(BOARD));
  await pause(1500);
  const listed = listedSecurities(await getText(LIST));

  const rows = [];
  const suspended = [];
  const neverTraded = [];
  const seen = new Set();
  for (const line of lines) {
    if (seen.has(line.ticker)) throw new Error(`${line.ticker} is on the board twice`);
    seen.add(line.ticker);
    const entry = listed.get(line.ticker);
    if (!entry) throw new Error(`${line.ticker} (${line.board.name}) is not on the listed-securities page`);
    if (entry.status === "I") throw new Error(`${line.ticker} is on the board but de-listed on the listed-securities page`);
    if (line.suspended || entry.status === "D") {
      suspended.push(line.ticker);
      continue;
    }
    if (!line.lastSale) {
      neverTraded.push(line.ticker);
      continue;
    }
    if (!boards.includes(line.board.name)) continue;
    const name = line.name || entry.name;
    if (!name) throw new Error(`${line.ticker} has no name`);
    let isin = "";
    const cross = CROSS_LISTED.get(line.ticker);
    if (cross) {
      if (!name.toUpperCase().includes(cross[2])) throw new Error(`${line.ticker} is now "${name}", not the JSE ${cross[1]}`);
      isin = cross[0];
    }
    rows.push({
      query: line.ticker,
      ticker: line.ticker,
      name,
      exchange: EXCHANGE,
      currency: line.board.currency,
      type: line.board.type,
      isin,
      mic: MIC,
      raw: [line.ticker, name, EXCHANGE, line.board.name, isin, line.board.currency].filter(Boolean).join(" "),
    });
  }
  const offBoard = [...listed.values()].filter((entry) => entry.status === "A" && !seen.has(entry.ticker)).map((entry) => entry.ticker);
  if (offBoard.length > MOST_OFF_BOARD) throw new Error(`${offBoard.length} active TTSE lines are off the board: ${offBoard.join(", ")}`);
  if (suspended.length > MOST_SUSPENDED) throw new Error(`${suspended.length} TTSE lines suspended, more than the ${MOST_SUSPENDED} expected`);
  for (const ticker of ["RFHL", "MASSY", "NCBFG", "AGL"]) {
    if (boards.includes("Ordinary Shares") && !rows.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
  }

  rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
  rows.dropped = { suspended, neverTraded, offBoard };
  if (!quiet) {
    const count = (type) => rows.filter((row) => row.type === type).length;
    console.error(
      `${rows.length} listings on the ${EXCHANGE} (${count("STOCK")} STOCK, ${count("FUND")} FUND; ` +
        `${rows.filter((row) => row.isin).length} with an ISIN); dropped ${suspended.length} suspended` +
        (suspended.length ? ` (${suspended.join(", ")})` : "") +
        `, ${neverTraded.length} never traded` +
        (neverTraded.length ? ` (${neverTraded.join(", ")})` : "") +
        (offBoard.length ? `; active but off the board: ${offBoard.join(", ")}` : ""),
    );
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await ttseBook();
  const tally = (key) => rows.reduce((counts, row) => ({ ...counts, [row[key]]: (counts[row[key]] || 0) + 1 }), {});
  console.log(JSON.stringify({ rows: rows.length, byType: tally("type"), byCurrency: tally("currency"), dropped: rows.dropped }));
}
