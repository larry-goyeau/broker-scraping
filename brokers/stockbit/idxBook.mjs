// The Indonesia Stock Exchange book, for the brokers whose only place is
// IDX (Stockbit, Mirae Asset, SimInvest, Samuel, Sucor, Bahana, Phintraco
// and the others of the same group). They order through the exchange's
// JATS, so the book is every share and ETF IDX lists today, less the lines
// that cannot trade.
//
// The exchange's own lists are read. idx.co.id answers a plain request
// with a Cloudflare challenge, so a headless Chrome opens the stock list
// page and the calls are made from inside it:
//
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//   https://www.idx.co.id/primary/StockData/GetSecuritiesStock?start=0&length=9999&language=en-us
//     (every listed share, with its board: Main, Development,
//     Acceleration, New Economy, Watchlist)
//   https://www.idx.co.id/en/market-data/exchanged-traded-fund-etf-data/exchange-traded-fund-etf-list
//   https://www.idx.co.id/primary/EDD/GetEtfMarket?length=9999
//     (every listed ETF)
//   https://www.idx.co.id/en/news/suspension
//   https://www.idx.co.id/primary/NewsAnnouncement/GetSuspension?indexFrom=0&pageSize=5000&lang=en
//     (suspend "SPT" and unsuspend "UPT" announcements, the last three
//     years; older ones are not served)
//   https://www.idx.co.id/primary/TradingSummary/GetStockSummary?length=9999&start=0&date=YYYYMMDD
//     (the last session, one row per share)
//   https://www.idx.co.id/primary/ListedCompany/GetTradingInfoSS?code=XXXX&start=0&length=60
//     (one share's last sessions)
//
// Left out:
//   - a share or ETF whose last announcement naming it alone is a
//     suspension, when it has not traded since (PTPP, WIKA, WSKT ...);
//   - a share with no trade in its last 20 sessions. IDX also suspends
//     shares in announcements that name several codes ("(>1 Code)"), whose
//     codes are only in the attached PDF, and shares suspended before the
//     three-year window (KBRI, LMAS, SRIL ...). On 24 October 2026 every
//     share left out this way had last traded on 30 June 2026 or earlier,
//     while the least traded open share had traded within four sessions,
//     so the 20-session line has a wide margin;
//   - a share whose summary row carries a delisting date already past;
//   - a line listed after the last session;
//   - GoTo's multiple-voting shares (GOTOM): in the session summary but not
//     in the exchange's share list, and they never trade.
// Warrants, rights, bonds, real-estate investment funds (DIRE, DINFRA) and
// mutual funds are not in these two lists. The Watchlist board (Papan
// Pemantauan Khusus, full call auction) is kept: it trades; a broker that
// refuses it drops it with the `boards` option of writeIdxCatalogue.
// Everything trades in rupiah.
//
// ISINs and full names come from TradingView's IDX search
// (../cgsid/tvlist.mjs), else from assets/stocks.csv / etfs.csv; the
// exchange's share list cuts names at 30 characters.
//
// The crawl (about 150 calls, with pauses) is kept in idx-cache.json next
// to this file for 12 hours, so the scrapers run back to back read IDX
// once. idx.co.id's Cloudflare check refuses the headless Chrome some days
// (HTTP 403 on every call); with CHROME_URL=http://127.0.0.1:9222 the crawl
// runs in a local Chrome started with --remote-debugging-port=9222 instead,
// a window the site lets through (as ../ccbolsa reads its exchange).
//
//   import { idxBook, writeIdxCatalogue } from "../stockbit/idxBook.mjs";
//   node brokers/stockbit/idxBook.mjs        prints the counts

import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { idxListings } from "../cgsid/tvlist.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://www.idx.co.id";
const HOME = `${SITE}/en/market-data/stocks-data/stock-list`;
const CACHE = new URL("idx-cache.json", import.meta.url);
const CACHE_HOURS = 12;
const QUIET_SESSIONS = 20;
const HISTORY = 60;
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
export const EXCHANGE = "Indonesia Stock Exchange";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const day = (value) => clean(value).slice(0, 10);

// Today's date in Jakarta, as YYYY-MM-DD.
function jakartaToday(offsetDays = 0) {
  const at = new Date(Date.now() - offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(at);
}

async function openSite(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(HOME, { waitUntil: "networkidle2", timeout: 90_000 }).catch(() => {});
    for (let wait = 0; wait < 30; wait += 1) {
      if (!/just a moment/i.test(await page.title().catch(() => ""))) return;
      await pause(1000);
    }
  }
  throw new Error("idx.co.id kept its Cloudflare challenge");
}

// One JSON call made from inside the page; a challenge page reopens the site.
async function api(page, path) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const text = await page
      .evaluate(async (url) => {
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        return `${response.status}\n${await response.text()}`;
      }, path)
      .catch((error) => `0\n${error.message}`);
    const cut = text.indexOf("\n");
    const status = text.slice(0, cut);
    const body = text.slice(cut + 1);
    if (status === "200") {
      try {
        return JSON.parse(body);
      } catch {
        last = `${path} is not JSON`;
      }
    } else {
      last = `${status} ${path}`;
    }
    await pause(3000 * (attempt + 1));
    await openSite(page);
  }
  throw new Error(last);
}

async function crawl() {
  const local = process.env.CHROME_URL;
  const browser = local
    ? await puppeteer.connect({ browserURL: local, defaultViewport: null, protocolTimeout: 300_000 })
    : await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"], protocolTimeout: 300_000 });
  let page = null;
  try {
    page = await browser.newPage();
    if (!local) await page.setUserAgent(UA);
    await openSite(page);

    const shares = (await api(page, "/primary/StockData/GetSecuritiesStock?start=0&length=9999&code=&sector=&board=&language=en-us")).data;
    await pause(1000);
    const etfs = (await api(page, "/primary/EDD/GetEtfMarket?length=9999")).data;
    await pause(1000);
    const from = jakartaToday(3 * 365).replaceAll("-", "");
    const to = jakartaToday().replaceAll("-", "");
    const news = await api(page, `/primary/NewsAnnouncement/GetSuspension?indexFrom=0&pageSize=5000&lang=en&dateFrom=${from}&dateTo=${to}`);
    if (!Array.isArray(news.Results) || news.Results.length !== news.ResultCount) {
      throw new Error(`the suspension list gave ${news.Results?.length} of ${news.ResultCount} announcements`);
    }
    await pause(1000);

    // The last session: today in Jakarta, else the day before, and so on.
    let session = null;
    for (let back = 0; back < 12 && !session; back += 1) {
      const date = jakartaToday(back);
      const body = await api(page, `/primary/TradingSummary/GetStockSummary?length=9999&start=0&date=${date.replaceAll("-", "")}`);
      if (Array.isArray(body.data) && body.data.length) {
        const rows = body.data.map((row) => ({ StockCode: row.StockCode, Volume: row.Volume, DelistingDate: row.DelistingDate }));
        session = { date, rows };
      }
      await pause(1000);
    }
    if (!session) throw new Error("no IDX session summary in the last 12 days");

    // The last sessions of each share that did not trade in the last one.
    const traded = new Map(session.rows.map((row) => [clean(row.StockCode), Number(row.Volume) > 0]));
    const histories = {};
    for (const share of shares) {
      const code = clean(share.Code);
      if (traded.get(code)) continue;
      const body = await api(page, `/primary/ListedCompany/GetTradingInfoSS?code=${encodeURIComponent(code)}&start=0&length=${HISTORY}`);
      histories[code] = (body.replies || []).map((row) => ({ date: day(row.Date), volume: Number(row.Volume) || 0 }));
      await pause(700);
    }
    const items = news.Results.map((item) => ({ Kode: item.Kode, Info_Type: item.Info_Type, Date: item.Date, Judul: item.Judul }));
    return { shares, etfs, news: items, session, histories };
  } finally {
    if (local) {
      await page?.close().catch(() => {});
      browser.disconnect();
    } else {
      await browser.close();
    }
  }
}

function cached() {
  try {
    const kept = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - Date.parse(kept.fetchedAt) < CACHE_HOURS * 3600_000 && kept.exchange && kept.tradingView) return kept;
  } catch {
    // no cache, or an unreadable one: crawl again
  }
  return null;
}

function csvIsins() {
  const out = new Map();
  for (const file of [STOCKS, ETFS]) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^IDX:([A-Z0-9-]+),IDX,([A-Z]{2}[A-Z0-9]{9}\d),(.*)$/);
      if (match && !out.has(match[1])) out.set(match[1], { isin: match[2], name: match[3].replace(/^"|"$/g, "") });
    }
  }
  return out;
}

// Every IDX share and ETF open to trade, as catalogue rows sorted by type
// then ticker; plus the lines left out, the board of each share and the
// session the run read.
export async function idxBookReport() {
  let kept = cached();
  const fromCache = Boolean(kept);
  if (!kept) {
    const exchange = await crawl();
    const tradingView = await idxListings();
    kept = { fetchedAt: new Date().toISOString(), exchange, tradingView };
    fs.writeFileSync(CACHE, JSON.stringify(kept));
  }
  const { shares, etfs, news, session, histories } = kept.exchange;
  const tv = new Map(kept.tradingView.map((row) => [row.ticker, row]));
  const csv = csvIsins();

  // The last announcement naming each code alone.
  const lastNews = new Map();
  for (const item of [...news].sort((a, b) => clean(a.Date).localeCompare(clean(b.Date)))) {
    const code = clean(item.Kode).toUpperCase();
    if (/^[A-Z0-9-]+$/.test(code)) lastNews.set(code, { type: clean(item.Info_Type), date: day(item.Date), title: clean(item.Judul) });
  }
  const summary = new Map(session.rows.map((row) => [clean(row.StockCode), row]));

  const rows = [];
  const left = [];
  const boards = {};
  const add = (ticker, idxName, type, board) => {
    const known = tv.get(ticker);
    if (known && known.type !== type) throw new Error(`${ticker} is ${type} on IDX and ${known.type} on TradingView`);
    const fallback = csv.get(ticker);
    const isin = known?.isin || fallback?.isin || "";
    const name = known?.name || idxName || fallback?.name;
    if (!name) throw new Error(`${ticker} has no name`);
    if (!isin) left.push(`${ticker} no ISIN`);
    if (!isin) return;
    if (board) boards[ticker] = board;
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: "IDX",
      mic: "XIDX",
      currency: "IDR",
      type,
      isin,
      raw: [ticker, name, "IDX", board || "ETF", isin, type].join(" "),
    });
  };
  // A single-code suspension the line has not traded since.
  const suspended = (code, lastTrade) => {
    const item = lastNews.get(code);
    return item && item.type === "SPT" && (!lastTrade || lastTrade <= item.date) ? item : null;
  };

  const seen = new Set();
  for (const share of shares) {
    const ticker = clean(share.Code).toUpperCase();
    if (seen.has(ticker)) throw new Error(`${ticker} is listed twice`);
    seen.add(ticker);
    const board = clean(share.ListingBoard);
    if (day(share.ListingDate) > session.date) {
      left.push(`${ticker} listed after ${session.date}`);
      continue;
    }
    const today = summary.get(ticker);
    if (today?.DelistingDate && day(today.DelistingDate) <= session.date) {
      left.push(`${ticker} delisted ${day(today.DelistingDate)}`);
      continue;
    }
    const history = Number(today?.Volume) > 0 ? [{ date: session.date, volume: 1 }] : histories[ticker] || [];
    const lastTrade = history.find((row) => row.volume > 0)?.date || "";
    const item = suspended(ticker, lastTrade);
    if (item) {
      left.push(`${ticker} suspended ${item.date}`);
      continue;
    }
    const recent = history.slice(0, QUIET_SESSIONS);
    if (!recent.some((row) => row.volume > 0)) {
      left.push(`${ticker} no trade in ${QUIET_SESSIONS} sessions${lastTrade ? ` (last ${lastTrade})` : ""}`);
      continue;
    }
    add(ticker, clean(share.Name), "STOCK", board);
  }
  for (const etf of etfs) {
    const ticker = clean(etf.Kode).toUpperCase();
    if (seen.has(ticker)) throw new Error(`${ticker} is listed twice`);
    seen.add(ticker);
    if (day(etf.TanggalPencatatan) > session.date) {
      left.push(`${ticker} listed after ${session.date}`);
      continue;
    }
    // No session history is served for ETFs: only the announcements count.
    const item = suspended(ticker, "");
    if (item) {
      left.push(`${ticker} suspended ${item.date}`);
      continue;
    }
    add(ticker, clean(etf.NamaProduk), "ETF", "");
  }

  rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
  const count = (type) => rows.filter((row) => row.type === type).length;
  if (count("STOCK") < 800) throw new Error(`only ${count("STOCK")} IDX shares`);
  if (count("ETF") < 30) throw new Error(`only ${count("ETF")} IDX ETFs`);
  for (const ticker of ["BBCA", "TLKM", "GOTO", "XIIT", "R-LQ45X"]) {
    if (!rows.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
  }
  if (left.length > 250) throw new Error(`${left.length} IDX lines left out`);
  return { rows, left, boards, session: session.date, fetchedAt: kept.fetchedAt, fromCache };
}

// The catalogue rows alone.
export async function idxBook() {
  return (await idxBookReport()).rows;
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types; `boards` drops the shares of those boards (Main, Development,
// Acceleration, New Economy board is "Ekonomi Baru", Watchlist).
export async function writeIdxCatalogue(here, file, { types = ["STOCK", "ETF"], boards = [] } = {}) {
  const report = await idxBookReport();
  const rows = report.rows.filter((row) => types.includes(row.type) && !boards.includes(report.boards[row.ticker]));
  const kept = stampRows(withoutObligations(rows.map((row) => ({ ...row }))));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const count = (type) => kept.filter((row) => row.type === type).length;
  console.error(
    `${kept.length} listings on ${EXCHANGE} (${count("STOCK")} STOCK, ${count("ETF")} ETF), session ${report.session}` +
      `${report.fromCache ? " (IDX read from idx-cache.json)" : ""}; ${report.left.length} lines not open to trade left out` +
      `${report.rows.length - rows.length ? `; ${report.rows.length - rows.length} of another type or board left out` : ""}` +
      `${kept.length < rows.length ? `; ${rows.length - kept.length} obligations left out` : ""}`
  );
  return kept;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = await idxBookReport();
  const count = (type) => report.rows.filter((row) => row.type === type).length;
  const byBoard = {};
  for (const board of Object.values(report.boards)) byBoard[board] = (byBoard[board] || 0) + 1;
  console.log(`${report.rows.length} rows (${count("STOCK")} STOCK, ${count("ETF")} ETF), session ${report.session}${report.fromCache ? ", from cache" : ""}`);
  console.log(`boards: ${JSON.stringify(byBoard)}`);
  console.log(`left out ${report.left.length}: ${report.left.join("; ")}`);
}
