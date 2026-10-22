// What JN Fund Managers sells in shares, with no login. JN has no list
// of its own. Its brokers take orders for Jamaica Stock Exchange shares,
// and it is a participating broker on the exchange's JTraderPro
// platform, which trades every JSE security. So the book is the JSE's
// equity markets: the Main Market and the Junior Market in JMD, and the
// USD Market. JN publishes its share fees (commission, cess, JTraderPro
// fee) in its 2025 fee schedule.
//
// The JSE listed-companies page gives, per market, the security, symbol,
// ISIN, currency and type. Ordinary shares and preference shares are
// kept (a preference share is equity here). The bond markets are not
// read. The JSE lists no ETF. A line is kept only when it is also on the
// day's price board of its market: a few listed lines are on no board
// and their instrument pages return no data. A line the board shows as
// suspended (red row, " (SUS)" after the symbol) is dropped too, and so is
// a listing whose name the JSE has suffixed "SUS": it cannot be bought
// until the exchange reinstates it. A company quoted in JMD
// and in USD (PROVEN, MTL, TJH...) has one row per currency, same ISIN
// and symbol, as the exchange prints it.
//
// The pages need a browser User-Agent (CloudFront answers 403 without).
//
//   https://www.jnfunds.com/stocks/
//   https://www.jnfunds.com/wp-content/uploads/JNFM-Fee-Schedule-Updated-2025.pdf
//   https://www.jamstockex.com/services/jtraderpro/
//   https://www.jamstockex.com/listings/listed-companies/?market=31   (22 Junior, 49 USD)
//   https://www.jamstockex.com/trading/trade-quotes/?market=31        (22, 49)
//
//   node brokers/jnfund/jnfund_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const HOST = "https://www.jamstockex.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const EXCHANGE = "Jamaica Stock Exchange";
const MIC = "XJAM";

// Market id on the JSE site, its name, its currency and the fewest
// listings it can hold before the page is taken as broken.
const MARKETS = [
  { id: 31, name: "Main Market", currency: "JMD", least: 50 },
  { id: 22, name: "Junior Market", currency: "JMD", least: 35 },
  { id: 49, name: "USD Market", currency: "USD", least: 12 },
];
const KINDS = new Set(["ORDINARY", "PREFERENCE", "US DENOMINATED"]);
// Listed lines a board may miss (dead records) before the read is refused.
const MOST_OFF_BOARD = 5;
// Lines one board may mark suspended before the read is refused.
const MOST_SUSPENDED = 10;

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "60", "-A", UA, url], { maxBuffer: 16_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }
  throw new Error(last || url);
}

function text(cell) {
  return cell
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0?39;|&#8217;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// The page prints the same table twice (phone and desktop layouts).
function listedLines(html, market) {
  const selected = html.match(/<option value="(\d+)"[^<]*\bselected\b/);
  if (selected?.[1] !== String(market.id)) throw new Error(`${market.name}: the listing page did not open market ${market.id}`);
  const header = /Security<\/th>[\s\S]*?Symbol<\/th>[\s\S]*?ISIN<\/th>[\s\S]*?Currency<\/th>[\s\S]*?Sector<\/th>[\s\S]*?Type<\/th>/;
  if (!header.test(html)) throw new Error(`${market.name}: listing table columns changed`);
  const lines = new Map();
  for (const [, body] of html.matchAll(/<tr\s+class="[^"]*tw-text-gray-800">([\s\S]*?)<\/tr>/g)) {
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    const id = body.match(/instrument=(\d+)/)?.[1];
    if (!id || cells.length < 6) throw new Error(`${market.name}: unreadable listing row ${text(body).slice(0, 80)}`);
    const [name, ticker, isin, currency, sector, kind] = cells.slice(0, 6).map(text);
    const line = { id, name, ticker: ticker.toUpperCase(), isin: isin.toUpperCase(), currency: currency.toUpperCase(), sector, kind: kind.toUpperCase() };
    const before = lines.get(id);
    if (before && JSON.stringify(before) !== JSON.stringify(line)) throw new Error(`${market.name}: instrument ${id} printed two ways`);
    lines.set(id, line);
  }
  if (lines.size < market.least) throw new Error(`${market.name}: only ${lines.size} listings`);
  return [...lines.values()];
}

// The board keeps a suspended line, with zero bid, ask and volume, and
// marks it two ways: its row is highlighted red (class tw-bg-red-200; the
// board legend reads "HIGHLIGHTED RED ROW - Stock Suspended") and " (SUS)"
// follows its symbol link. Either mark makes the line suspended.
function boardLines(html, market) {
  if (!/>(?:ORDINARY|PREFERENCE|US DENOMINATED) SHARES<\/h3>/.test(html)) throw new Error(`${market.name}: price board has no share table`);
  if (!/HIGHLIGHTED RED ROW\s*-\s*Stock Suspended/i.test(text(html))) throw new Error(`${market.name}: the board legend no longer says red rows are suspended`);
  const ids = new Set();
  const suspended = new Set();
  for (const [, cls, body] of html.matchAll(/<tr\s+class="([^"]*)"\s*>([\s\S]*?)<\/tr>/g)) {
    const cell = body.match(/<a href="[^"]*\/trading\/instruments\/\?instrument=(\d+)"[^>]*>\s*([^<]*?)\s*<\/a>([^<]*)<\/td>/);
    if (!cell) continue;
    const [, id, symbol, after] = cell;
    if (!symbol) throw new Error(`${market.name}: board row ${id} has no symbol`);
    ids.add(id);
    const mark = text(after);
    if (mark && !/^\(SUS\)$/i.test(mark)) throw new Error(`${market.name}: board symbol ${symbol} carries an unknown mark "${mark}"`);
    if (/\btw-bg-red-200\b/.test(cls) || mark) suspended.add(id);
  }
  const linked = new Set([...html.matchAll(/\/trading\/instruments\/\?instrument=(\d+)/g)].map((match) => match[1]));
  if (linked.size !== ids.size) throw new Error(`${market.name}: ${linked.size - ids.size} board rows no longer read as symbol rows`);
  if (ids.size < market.least) throw new Error(`${market.name}: price board shows only ${ids.size} lines`);
  if (suspended.size > MOST_SUSPENDED) throw new Error(`${market.name}: ${suspended.size} lines marked suspended, more than the ${MOST_SUSPENDED} expected`);
  return { ids, suspended };
}

const rows = [];
const offBoard = [];
const suspendedTickers = [];
const seen = new Set();
for (const market of MARKETS) {
  const listed = listedLines(await getText(`${HOST}/listings/listed-companies/?market=${market.id}`), market);
  const { ids: board, suspended } = boardLines(await getText(`${HOST}/trading/trade-quotes/?market=${market.id}`), market);
  const listedIds = new Set(listed.map((line) => line.id));
  const unknown = [...board].filter((id) => !listedIds.has(id));
  if (unknown.length) throw new Error(`${market.name}: board lines not on the listing page: ${unknown.join(", ")}`);
  const missing = listed.filter((line) => !board.has(line.id));
  if (missing.length > MOST_OFF_BOARD) throw new Error(`${market.name}: ${missing.length} listed lines are off the price board`);
  offBoard.push(...missing.map((line) => line.ticker));
  for (const line of listed) {
    if (!board.has(line.id)) continue;
    // Second guard: the JSE also tags some suspended names "(SUS)" / "SUS".
    if (suspended.has(line.id) || /\(?\bSUS\)?$/.test(line.name)) {
      suspendedTickers.push(line.ticker);
      continue;
    }
    if (!KINDS.has(line.kind)) throw new Error(`${line.ticker} (${market.name}) is ${line.kind || "unmarked"}`);
    if (line.currency !== market.currency) throw new Error(`${line.ticker} is in ${line.currency} on the ${market.name}`);
    if (!line.ticker || !line.name) throw new Error(`${market.name}: unreadable listing ${line.id}`);
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(line.isin)) throw new Error(`no ISIN for ${line.ticker} (${line.isin})`);
    const key = `${line.isin} ${line.currency} ${line.ticker}`;
    if (seen.has(key)) throw new Error(`repeated ${key}`);
    seen.add(key);
    rows.push({
      query: line.ticker,
      ticker: line.ticker,
      name: line.name,
      exchange: EXCHANGE,
      currency: line.currency,
      type: "STOCK",
      isin: line.isin,
      mic: MIC,
      raw: [line.ticker, line.name, EXCHANGE, market.name, line.isin, line.currency, line.kind].join(" "),
    });
  }
}

rows.sort((left, right) => left.ticker.localeCompare(right.ticker) || left.currency.localeCompare(right.currency));
const written = stampRows(withoutObligations(rows));
if (written.length !== rows.length) throw new Error(`the bond filter dropped ${rows.length - written.length} shares`);
fs.writeFileSync(new URL("jnfund-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
const byCurrency = written.reduce((counts, row) => ({ ...counts, [row.currency]: (counts[row.currency] || 0) + 1 }), {});
console.error(
  `${written.length} listings (${written.length} STOCK) on ${EXCHANGE}: ` +
    Object.entries(byCurrency).map(([currency, count]) => `${count} ${currency}`).join(", ") +
    `; dropped ${suspendedTickers.length} suspended (red row or SUS on the board)` +
    (suspendedTickers.length ? `: ${suspendedTickers.join(", ")}` : "") +
    `, ${offBoard.length} off the price board` +
    (offBoard.length ? `: ${offBoard.join(", ")}` : ""),
);
