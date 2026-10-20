// What Bloomo Securities (ブルーモ証券, Japan) sells, with no login. Bloomo
// trades only American shares and ETFs that it has chosen ("NYSEやNASDAQ
// 等の米国市場に上場している株式およびETF…のうち当社にて選定した銘柄"),
// and its help centre article "取扱の銘柄は何ですか？" prints the whole
// list as one table: 分類 (株式 a share, ETF), ティッカー, 名称, and the
// NISA flag (成長, つみたて). The table is the catalogue; the article states
// the date the list holds for ("2026年8月時点"). A "※" after a ticker only
// points to the leveraged and inverse ETF risk note and is dropped. No
// Japanese shares, bonds or other markets are sold.
//
// The table prints no venue, ISIN or currency. The US book is one NBBO
// (NYSE, Nasdaq, NYSE Arca, NYSE American and Cboe BZX), so each title is
// one row in dollars. Its venue is the primary listing and its ISIN the
// one ../../assets/stocks.csv or etfs.csv holds for the ticker (usRow in
// ../mitsubishiufjesmart/japan.mjs, which reads AMEX as NYSE Arca for an
// ETF and NYSE American for a share). When the lists hold several ISINs
// for the ticker, the row keeps none and lists the candidates in
// "matches", as usRow does. A ticker those lists do not hold on an
// American exchange stays "US", with no MIC.
//
//   https://bloomo.co.jp/support/about/取扱の銘柄は何ですか？
//
// The article is updated monthly at best, so it still names companies that
// have since left the tape (Electronic Arts, Hologic, Qorvo, Warner Bros.
// Discovery... after their take-overs). A ticker is kept only when the US
// symbol directories of the day, Nasdaq Trader's official lists of every
// security listed on a US exchange, name it (a test issue is left out):
//
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   (same files as https://www.nasdaqtrader.com/dynamic/SymDir/, whose web
//   copy can answer with a bot check)
//
// A ticker that changed with no change of company takes its new ticker,
// from the issuer's own filing:
//   PSKY -> SKYD: "the combined company is named Skydance ... NYSE symbol
//   SKYD" (Paramount Skydance 8-K, 6 October 2026,
//   https://www.sec.gov/Archives/edgar/data/0002041610/000110465926113913/tm2626659d7_8k.htm)
//
//   node brokers/bloomo/bloomo_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { usRow } from "../mitsubishiufjesmart/japan.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PAGE = `https://bloomo.co.jp/support/about/${encodeURIComponent("取扱の銘柄は何ですか？")}`;
const KIND = { 株式: "STOCK", ETF: "ETF" };
const US_MICS = new Set(["XNYS", "XNAS", "ARCX", "XASE", "BATS"]);

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "ja,en;q=0.8" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const html = await get(PAGE);
const asOf = decode(html.match(/(\d{4}年\d{1,2}月時点)/)?.[1] || "");
if (!asOf) throw new Error("the article no longer says the date of the list");
const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((match) => match[1]);
if (tables.length !== 1) throw new Error(`the article has ${tables.length} tables`);

const lines = [];
for (const [, row] of tables[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
  const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((match) => decode(match[1]));
  if (cells.length !== 4) throw new Error(`a row has ${cells.length} cells: ${cells.join(" | ")}`);
  if (cells[0] === "分類") continue;
  lines.push(cells);
}
if (lines.length < 800) throw new Error(`the table has only ${lines.length} rows`);

// --- US symbol directories ---
const LISTING = { Q: "XNAS", N: "XNYS", A: "XASE", P: "ARCX", Z: "BATS" };
const RENAMED = { PSKY: "SKYD" };
const directory = new Map();
for (const [file, header] of [
  ["nasdaqlisted.txt", "Symbol|Security Name|Market Category|Test Issue"],
  ["otherlisted.txt", "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF"],
]) {
  let body = "";
  try {
    body = execFileSync("curl", ["-s", "--max-time", "120", `ftp://ftp.nasdaqtrader.com/symboldirectory/${file}`], { maxBuffer: 64 << 20 }).toString("utf8");
  } catch {
    body = "";
  }
  if (!body.startsWith(header)) body = await get(`https://www.nasdaqtrader.com/dynamic/SymDir/${file}`);
  if (!body.startsWith(header)) throw new Error(`${file}: unexpected header ${body.slice(0, 60)}`);
  for (const line of body.split(/\r?\n/).slice(1)) {
    const cells = line.split("|");
    if (cells.length < 7 || line.startsWith("File Creation Time")) continue;
    const nasdaq = file === "nasdaqlisted.txt";
    if ((nasdaq ? cells[3] : cells[6]) === "Y") continue;
    directory.set(cells[0], { code: nasdaq ? "Q" : cells[2], name: cells[1].trim() });
  }
}
if (directory.size < 10000) throw new Error(`the US directories hold only ${directory.size} lines`);
const listing = (ticker) => [ticker, ticker.replace(/[/-]/g, "."), ticker.replace(/[./-]/g, "")].map((spelling) => directory.get(spelling)).find(Boolean);
const gone = [];
const renamed = [];

const rows = [];
const seen = new Set();
for (const [kind, rawTicker, name, nisa] of lines) {
  const type = KIND[kind];
  if (!type) throw new Error(`${rawTicker} is a ${kind}`);
  const ticker = rawTicker.replace(/※/g, "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]*(?:[./-][A-Z0-9]+)?$/.test(ticker)) throw new Error(`unreadable ticker ${rawTicker}`);
  if (seen.has(ticker)) throw new Error(`${ticker} is listed twice`);
  seen.add(ticker);
  let listedTicker = ticker;
  if (!listing(ticker)) {
    if (RENAMED[ticker] && listing(RENAMED[ticker])) {
      listedTicker = RENAMED[ticker];
      renamed.push(`${ticker}->${listedTicker}`);
    } else {
      gone.push(`${ticker} (${name})`);
      continue;
    }
  }
  const row = usRow({ symbol: listedTicker, name, type, note: [kind, nisa && `NISA ${nisa}`].filter(Boolean).join(" ") });
  if (listedTicker !== ticker && !US_MICS.has(row.mic) && LISTING[listing(listedTicker).code]) {
    row.mic = LISTING[listing(listedTicker).code];
    row.exchange = row.mic;
  }
  // The book is the NBBO: a ticker the asset lists hold only over the
  // counter (or not at all) stays "US".
  if (!US_MICS.has(row.mic)) {
    row.exchange = "US";
    delete row.mic;
    row.isin = "";
    row.query = ticker;
  }
  rows.push({
    query: row.query,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    ...(row.mic ? { mic: row.mic } : {}),
    currency: "USD",
    type,
    isin: row.isin || "",
    raw: [kind, rawTicker, name, nisa].filter(Boolean).join(" | "),
    // Several ISINs on file for the ticker (an old and a new one, a
    // redomiciled company): the candidates, as usRow leaves them.
    ...(row.matches && row.mic ? { matches: row.matches } : {}),
  });
}

function expect(ticker, type, exchange) {
  const row = rows.find((item) => item.ticker === ticker);
  if (!row) throw new Error(`${ticker} is missing`);
  if (row.type !== type) throw new Error(`${ticker} is a ${row.type}`);
  if (exchange && row.exchange !== exchange) throw new Error(`${ticker} is on ${row.exchange}`);
}
expect("AAPL", "STOCK", "XNAS");
expect("JPM", "STOCK", "XNYS");
expect("VOO", "ETF", "ARCX");
expect("QQQ", "ETF", "XNAS");
expect("EWJ", "ETF");
const etfs = rows.filter((row) => row.type === "ETF").length;
if (rows.length - etfs < 600 || etfs < 150) throw new Error(`short list: ${rows.length - etfs} shares, ${etfs} ETFs`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("bloomo-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`Bloomo list ${asOf}: ${rows.length} titles, ${rows.filter((row) => row.isin).length} with an ISIN`, counts);
console.error(`not in the US directories, left out (${gone.length}): ${gone.join("; ")}`);
console.error(`under a new ticker (${renamed.length}): ${renamed.join(" ")}`);
if (gone.length > 0.05 * lines.length) throw new Error(`${gone.length} tickers in no directory`);
const loose = rows.filter((row) => row.exchange === "US").map((row) => row.ticker);
if (loose.length) console.error(`no American listing in the asset lists: ${loose.join(" ")}`);
