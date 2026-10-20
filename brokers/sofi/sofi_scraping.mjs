// What SoFi Invest (US) sells in shares and exchange-traded funds, with no login.
// SoFi's public stock sitemap names one page per ticker it shows:
// /invest/stock/<TICKER>/, a share class written with a slash (/stock/BF/B/ is
// BF.B) and a preferred, right or when-issued line in the consolidated-tape
// spelling (ABRpD, GGTrw). The page gives no exchange, no name and no ISIN.
// The live site sits behind a Cloudflare "confirm you're human" check, which
// is not got round here. A copy saved from a browser that passed the check
// can be given with --sitemap=<file>; its newest lastmod stands for its date,
// and the US directories are then read from Nasdaq Trader's FTP server
// (ftp://ftp.nasdaqtrader.com/symboldirectory/, falling back to the Wayback
// copy nearest that date). Without it, the newest Wayback Machine copy is read.
// The date is printed and written into every raw field. At the
// 20260709204733 capture, 35,113 of its 35,122 pages carried lastmod
// 2025-10-13 and nine 2026-06-09; the live sitemap of 2026-10-19 names
// 17,825 pages, all with that day's lastmod.
//
//   https://www.sofi.com/invest/stocks-sitemap.xml
//   https://web.archive.org/cdx/search/cdx?url=sofi.com/invest/stocks-sitemap.xml&output=json&limit=-5&filter=statuscode:200
//   https://web.archive.org/web/<timestamp>id_/https://www.sofi.com/invest/stocks-sitemap.xml
//
// The sitemap mixes listed shares and funds, foreign over-the-counter lines,
// mutual funds and names that have left the tape. Every ticker is put to the
// official US symbol directories, in the Wayback copy of each file nearest
// the sitemap capture (the live files are behind an Incapsula check):
//
//   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//
// nasdaqlisted is matched on its Symbol, otherlisted on its CQS Symbol, which
// is SoFi's spelling. A test issue is left out.
//
// Rules:
// - A ticker in a directory is one row on its listing exchange (Nasdaq, NYSE,
//   NYSE American, NYSE Arca, Cboe BZX, NYSE Texas, Texas Stock Exchange)
//   with that exchange's MIC, in dollars. US venues are one NBBO market, so
//   no row is repeated on the others. The name is the directory's. ETF flag
//   Y is an ETF, or an ETN when the name says ETN or exchange-traded note;
//   a line flagged N whose name says ETF, or a trust on NYSE Arca or Cboe BZX
//   (GraniteShares Gold Trust, BAR), is an ETF; the rest are STOCK.
// - A five-letter ticker ending in X that is in no directory is a mutual fund
//   and is left out: SoFi's stock pages are for stocks and ETFs.
// - Any other ticker in no directory is kept as an OTC Markets row (OTCM)
//   only when FINRA's OTC transparency data shows it traded off-exchange as
//   an OTC equity (tier OTCE, ATS or non-ATS) in one of the 26 most recent
//   published weeks. The name is FINRA's. OTC Markets' own screener API
//   answers "Temporarily Unavailable" from here, so FINRA's public API is the
//   check. A ticker with no such trade is left out as gone from the tape.
//
//   https://api.finra.org/data/group/otcMarket/name/weeklySummary
//
// SoFi prints no ISIN. A row takes the ISIN that assets/stocks.csv and
// assets/etfs.csv give the same ticker on a US exchange (OTC for an OTC row);
// several ISINs leave the field empty and go to `matches`. Bonds and notes
// (baby bonds) are left out by withoutObligations.
//
//   node brokers/sofi/sofi_scraping.mjs
//   node brokers/sofi/sofi_scraping.mjs --sitemap=~/Downloads/stocks-sitemap.xml

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITEMAP = "https://www.sofi.com/invest/stocks-sitemap.xml";
const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const FINRA = "https://api.finra.org/data/group/otcMarket/name/weeklySummary";
const OTC_WEEKS = 26;

// Directory exchange code -> row place.
const PLACES = {
  Q: { exchange: "Nasdaq", mic: "XNAS" },
  N: { exchange: "New York Stock Exchange", mic: "XNYS" },
  A: { exchange: "NYSE American", mic: "XASE" },
  P: { exchange: "NYSE Arca", mic: "ARCX" },
  Z: { exchange: "Cboe BZX", mic: "BATS" },
  M: { exchange: "NYSE Texas", mic: "XCHI" },
  F: { exchange: "Texas Stock Exchange", mic: "TXSE" },
  V: { exchange: "IEX", mic: "IEXG" },
};
const OTC = { exchange: "OTC Markets", mic: "OTCM" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBytes(url, init = {}, tries = 6) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, ...(init.headers || {}) },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.status === 204) return Buffer.alloc(0);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// A Wayback id_ copy is the bytes as captured, gzip included.
async function text(url, init) {
  const bytes = await fetchBytes(url, init);
  return (bytes[0] === 0x1f && bytes[1] === 0x8b ? zlib.gunzipSync(bytes) : bytes).toString("utf8");
}

async function captures(url) {
  const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url.replace(/^https?:\/\/(www\.)?/, ""))}&output=json&filter=statuscode:200`;
  const rows = JSON.parse(await text(cdx));
  return rows.slice(1).map(([, timestamp, original]) => ({ timestamp, original }));
}

const stampTime = (stamp) =>
  Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(8, 10), +stamp.slice(10, 12));

// The capture nearest `stamp` whose body starts with the expected header.
async function nearestCopy(url, stamp, header) {
  const list = (await captures(url)).sort(
    (left, right) => Math.abs(stampTime(left.timestamp) - stampTime(stamp)) - Math.abs(stampTime(right.timestamp) - stampTime(stamp))
  );
  for (const hit of list.slice(0, 6)) {
    const body = await text(`https://web.archive.org/web/${hit.timestamp}id_/${hit.original}`);
    if (body.startsWith(header)) return { timestamp: hit.timestamp, body };
    console.error(`skipping ${url} at ${hit.timestamp}: not a directory file`);
  }
  throw new Error(`no usable Wayback copy of ${url}`);
}

// SoFi spelling -> one key shared with the CSV spellings (BRK/B, BRK B, ABR/PD, ABR.PRD).
function sofiKey(ticker) {
  return ticker.replace(/([a-z]+)(.*)$/, (_, low, rest) => `.${low.toUpperCase()}${rest}`);
}
function csvKey(ticker) {
  return ticker.toUpperCase().replace(/[\/ _-]/g, ".").replace(/\.PR([A-Z]?)$/, ".P$1");
}

function isinBook() {
  const listed = new Map();
  const otc = new Map();
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const body = fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8");
    for (const line of body.split(/\r?\n/).slice(1)) {
      const [code, exchange, isin] = line.split(",");
      if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin || "")) continue;
      const book = exchange === "OTC" ? otc : ["NYSE", "NASDAQ", "AMEX", "CBOE"].includes(exchange) ? listed : null;
      if (!book) continue;
      const key = csvKey(code.slice(code.indexOf(":") + 1));
      if (!book.has(key)) book.set(key, new Set());
      book.get(key).add(isin);
    }
  }
  return { listed, otc };
}

function withIsin(row, book) {
  const ids = book.get(sofiKey(row.ticker));
  if (!ids || !ids.size) return { ...row, isin: "" };
  const out = { ...row };
  out.isin = stampIsinMatches(out, new Map([[row.mic, ids]]), row.ticker);
  return out;
}

// --- SoFi sitemap: a saved copy, or the newest Wayback copy ---
const savedArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const savedPath = savedArg ? savedArg.slice("--sitemap=".length).replace(/^~(?=\/)/, process.env.HOME) : "";
let snapshot;
let sitemap;
if (savedPath) {
  sitemap = fs.readFileSync(savedPath, "utf8");
  const newest = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((hit) => hit[1]).sort().at(-1) || "";
  snapshot = `${newest.slice(0, 10).replace(/-/g, "")}000000`;
  if (!/^\d{14}$/.test(snapshot)) throw new Error(`no lastmod in ${savedPath}`);
} else {
  const sitemapCopies = (await captures(SITEMAP)).filter((hit) => /stocks-sitemap\.xml$/.test(hit.original));
  if (!sitemapCopies.length) throw new Error("no Wayback copy of the SoFi sitemap");
  snapshot = sitemapCopies.map((hit) => hit.timestamp).sort().at(-1);
  sitemap = await text(`https://web.archive.org/web/${snapshot}id_/${SITEMAP}`);
}
const pages = [...sitemap.matchAll(/<loc>https:\/\/www\.sofi\.com\/invest\/stock\/(.+?)\/<\/loc>/g)].map((hit) =>
  decodeURIComponent(hit[1])
);
if (pages.length < 10000) throw new Error(`the sitemap at ${snapshot} names only ${pages.length} stock pages`);
const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((hit) => hit[1]).sort();
const tickers = [...new Set(pages.map((page) => page.replace(/\//g, ".")))];
console.error(`sitemap ${snapshot}: ${pages.length} pages, ${tickers.length} tickers, lastmod ${lastmods[0]} to ${lastmods.at(-1)}`);

// --- US symbol directories ---
// A saved sitemap is today's: today's directory files match it best. The web
// copies sit behind an Incapsula check; Nasdaq Trader's own FTP server
// publishes the same files and is read with curl (Node has no FTP client).
async function directoryFile(url, header) {
  if (savedPath) {
    const ftp = `ftp://ftp.nasdaqtrader.com/symboldirectory/${url.split("/").at(-1)}`;
    try {
      const body = execFileSync("curl", ["-s", "--max-time", "120", ftp], { maxBuffer: 64 << 20 }).toString("utf8");
      if (body.startsWith(header)) return { timestamp: "ftp", body };
    } catch (error) {
      console.error(`${ftp}: ${error.message}`);
    }
  }
  return nearestCopy(url, snapshot, header);
}
const nasdaq = await directoryFile(NASDAQ_LISTED, "Symbol|Security Name|Market Category|Test Issue");
const other = await directoryFile(OTHER_LISTED, "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF");
console.error(`nasdaqlisted ${nasdaq.timestamp}, otherlisted ${other.timestamp}`);

const directory = new Map();
const tests = new Set();
for (const line of nasdaq.body.split(/\r?\n/).slice(1)) {
  const cells = line.split("|");
  if (cells.length < 8 || line.startsWith("File Creation Time")) continue;
  const [symbol, name, , test, , , etf] = cells;
  if (test === "Y") tests.add(symbol);
  else directory.set(symbol, { code: "Q", name: name.trim(), etf, line });
}
for (const line of other.body.split(/\r?\n/).slice(1)) {
  const cells = line.split("|");
  if (cells.length < 8 || line.startsWith("File Creation Time")) continue;
  const [, name, code, cqs, etf, , test] = cells;
  if (test === "Y") tests.add(cqs);
  else directory.set(cqs, { code, name: name.trim(), etf, line });
}
if (directory.size < 10000) throw new Error(`the directories hold only ${directory.size} lines`);

// --- FINRA OTC equity trades, newest published weeks ---
async function finraWeek(week) {
  const symbols = [];
  for (const summary of ["OTC_W_SMBL", "ATS_W_SMBL"]) {
    for (let offset = 0; ; offset += 5000) {
      const body = await text(FINRA, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: 5000,
          offset,
          fields: ["issueSymbolIdentifier", "issueName", "totalWeeklyTradeCount"],
          compareFilters: [
            { compareType: "EQUAL", fieldName: "tierIdentifier", fieldValue: "OTCE" },
            { compareType: "EQUAL", fieldName: "weekStartDate", fieldValue: week },
            { compareType: "EQUAL", fieldName: "summaryTypeCode", fieldValue: summary },
          ],
        }),
      });
      const rows = body.trim() ? JSON.parse(body) : [];
      symbols.push(...rows);
      if (rows.length < 5000) break;
    }
  }
  return symbols;
}

const monday = new Date();
monday.setUTCHours(0, 0, 0, 0);
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const isoDay = (date) => date.toISOString().slice(0, 10);
const traded = new Map();
let weeks = [];
for (let back = 0; back < OTC_WEEKS + 12 && weeks.length < OTC_WEEKS; back += 1) {
  const week = isoDay(new Date(monday.getTime() - back * 7 * 864e5));
  const rows = await finraWeek(week);
  if (!rows.length) {
    if (weeks.length) throw new Error(`FINRA has no OTC week ${week} inside the window`);
    continue;
  }
  weeks.push(week);
  for (const row of rows) {
    const symbol = row.issueSymbolIdentifier;
    if (!symbol || !(row.totalWeeklyTradeCount > 0)) continue;
    if (!traded.has(symbol)) traded.set(symbol, { week, name: String(row.issueName || "").replace(/\s+/g, " ").trim() });
  }
}
if (weeks.length < OTC_WEEKS || traded.size < 8000) throw new Error(`FINRA gave ${weeks.length} weeks and ${traded.size} symbols`);
console.error(`FINRA OTCE weeks ${weeks.at(-1)} to ${weeks[0]}: ${traded.size} traded symbols`);

// --- rows ---
function typeOf(name, flag, mic) {
  if (/\bETNs?\b|exchange[- ]traded notes?/i.test(name)) return "ETN";
  if (flag === "Y" || /\bETFs?\b/i.test(name)) return "ETF";
  if ((mic === "ARCX" || mic === "BATS") && /\bTrust\b/.test(name)) return "ETF";
  return "STOCK";
}

const isins = isinBook();
const rows = [];
const tally = { listed: 0, otc: 0, mutualFund: 0, test: 0, gone: 0, oddSpelling: 0 };
const gone = { fiveLetterForeign: 0, other: 0 };
const page = (ticker) => `${snapshot} /invest/stock/${ticker.replace(/\./g, "/")}/`;
for (const ticker of tickers) {
  if (!/^[A-Za-z0-9.]+$/.test(ticker)) {
    tally.oddSpelling += 1;
    console.error(`odd sitemap ticker: ${ticker}`);
    continue;
  }
  const hit = directory.get(ticker);
  if (hit) {
    const place = PLACES[hit.code];
    if (!place) throw new Error(`unknown directory exchange ${hit.code} for ${ticker}`);
    tally.listed += 1;
    rows.push(
      withIsin(
        {
          query: ticker,
          ticker,
          name: hit.name,
          exchange: place.exchange,
          mic: place.mic,
          currency: "USD",
          type: typeOf(hit.name, hit.etf, place.mic),
          raw: `sofi ${page(ticker)} | ${hit.code === "Q" ? `nasdaqlisted ${nasdaq.timestamp}` : `otherlisted ${other.timestamp}`} ${hit.line}`,
        },
        isins.listed
      )
    );
    continue;
  }
  if (tests.has(ticker)) {
    tally.test += 1;
    continue;
  }
  if (/^[A-Z]{4}X$/.test(ticker)) {
    tally.mutualFund += 1;
    continue;
  }
  const trade = traded.get(ticker);
  if (!trade) {
    tally.gone += 1;
    gone[/^[A-Z]{4}[FY]$/.test(ticker) ? "fiveLetterForeign" : "other"] += 1;
    continue;
  }
  tally.otc += 1;
  const name = trade.name || ticker;
  rows.push(
    withIsin(
      {
        query: ticker,
        ticker,
        name,
        exchange: OTC.exchange,
        mic: OTC.mic,
        currency: "USD",
        type: typeOf(name, "N"),
        raw: `sofi ${page(ticker)} | FINRA OTCE last traded week ${trade.week}: ${name}`,
      },
      isins.otc
    )
  );
}

const check = (ticker, exchange, type) => {
  const row = rows.find((one) => one.ticker === ticker);
  if (!row || (exchange && row.exchange !== exchange) || (type && row.type !== type)) {
    throw new Error(`${ticker} is not a ${exchange || ""} ${type || ""} row`);
  }
};
check("AAPL", "Nasdaq", "STOCK");
check("SPY", "NYSE Arca", "ETF");
check("BF.B", "New York Stock Exchange", "STOCK");
if (tally.listed < 8000) throw new Error(`only ${tally.listed} listed tickers`);

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("sofi-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

// --- report ---
const unresolved = new Set();
const counts = {};
for (const row of kept) {
  const { venue } = resolveVenue(row);
  if (!venue || venue.mic !== row.mic) unresolved.add(`${row.exchange}|${row.mic}|${row.currency}`);
  const key = `${row.exchange} ${row.type}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(
  `${kept.length} rows from ${tickers.length} tickers (snapshot ${snapshot}); ${kept.filter((row) => row.isin).length} with an ISIN; ` +
    `${rows.length - kept.length} bonds and notes left out`,
  tally,
  gone
);
if (unresolved.size) {
  console.error(`unresolved venues: ${[...unresolved].join(", ")}`);
  process.exitCode = 1;
}
