// What Ajaib sells in shares and exchange-traded funds, with no login.
// The American book is the public explore table. It does not name the
// exchange inside the United States, so that row stays "US". The Jakarta
// table does not name a board, so that row stays IDX. A plain fetch is
// refused by Cloudflare, so the pages are read in the Chrome that is
// already open on port 9222. One ISIN is filled from the shared lists
// when a single code on the allowed places matches. Several matches stay
// on the row, and so does IDX:TICKER when the lists have none.
//
//   https://ajaib.co.id/saham-amerika/aset/page/1
//   https://ajaib.co.id/saham/aset/page/1
//   https://ajaib.co.id/sitemap-saham-amerika.xml
//   https://ajaib.co.id/sitemap-saham.xml
//
//   node brokers/ajaib/ajaib_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const US_ROOT = "https://ajaib.co.id/saham-amerika/aset/page/";
const IDX_ROOT = "https://ajaib.co.id/saham/aset/page/";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const OUTPUT = new URL("./ajaib-parsed.json", import.meta.url);
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "ARCA", "NYSEARCA", "BATS", "CBOE"];

function loadBooks() {
  const books = new Map();
  const funds = new Set();
  const read = (file, fund) => {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const columns = line.split(",");
      const ticker = String(columns[0] || "").trim().toUpperCase().split(":").pop();
      const place = String(columns[1] || "").trim().toUpperCase();
      const isin = String(columns[2] || "").trim().toUpperCase();
      if (!ticker || !place || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) continue;
      if (!books.has(ticker)) books.set(ticker, new Map());
      const places = books.get(ticker);
      if (!places.has(place)) places.set(place, new Set());
      places.get(place).add(isin);
      if (fund) funds.add(`${place}|${ticker}`);
    }
  };
  read(STOCKS, false);
  read(ETFS, true);
  return { books, funds };
}

function identity(row, books, funds) {
  const places = row.exchange === "IDX" ? ["IDX"] : US_PLACES;
  const book = books.get(row.ticker);
  const found = new Set();
  for (const place of places) {
    for (const isin of book?.get(place) || []) found.add(isin);
  }
  let isin = "";
  const matches = [];
  if (found.size === 1) {
    isin = [...found][0];
  } else if (found.size === 0) {
    if (row.exchange === "IDX") matches.push(`IDX:${row.ticker}`);
  } else {
    for (const place of places) {
      const ids = book?.get(place);
      if (!ids || ids.size === 0) continue;
      matches.push(`${place}:${row.ticker}`);
      for (const id of ids) matches.push(id);
    }
  }
  const type = places.some((place) => funds.has(`${place}|${row.ticker}`)) || /\bETF\b/.test(row.name)
    ? "ETF"
    : "STOCK";
  return { isin, matches, type };
}

async function readBook(page, root) {
  const open = async (n) => {
    const url = `${root}${n}`;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForSelector("table tr td a", { timeout: 20000 });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
    if (lastError) throw new Error(`${url} did not render a table`);
    return page.evaluate(() => {
      const rows = [...document.querySelectorAll("table tr")].map((tr) => {
        const href = tr.querySelector("a")?.getAttribute("href") || "";
        const ticker = decodeURIComponent(href.split("/").filter(Boolean).pop() || "").trim().toUpperCase();
        const name = (tr.querySelectorAll("td")[1]?.innerText || "").replace(/\s+/g, " ").trim();
        if (!ticker || !name || href.includes("/page/")) return null;
        return { ticker, name };
      }).filter(Boolean);
      const last = Math.max(0, ...[...document.querySelectorAll("a")].map((anchor) => {
        const match = (anchor.getAttribute("href") || "").match(/\/page\/(\d+)/);
        return match ? Number(match[1]) : 0;
      }));
      return { rows, last };
    });
  };
  const head = await open(1);
  if (head.last < 2) throw new Error(`${root}1 has no next page`);
  const found = new Map();
  const take = (rows, n) => {
    if (rows.length < 1) throw new Error(`${root}${n} has no rows`);
    for (const row of rows) {
      if (!found.has(row.ticker)) found.set(row.ticker, row.name);
    }
  };
  take(head.rows, 1);
  for (let n = 2; n <= head.last; n += 1) {
    let book;
    let fresh = 0;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      book = await open(n);
      fresh = book.rows.filter((row) => !found.has(row.ticker)).length;
      if (n === head.last || fresh >= 5) break;
    }
    if (n < head.last && fresh < 5) throw new Error(`${root}${n} repeated an earlier page`);
    take(book.rows, n);
    if (n % 10 === 0) console.log(`${root} ${n}/${head.last}, ${found.size} names`);
  }
  console.log(`${root} ${head.last} pages, ${found.size} names`);
  return found;
}

function listedCodes() {
  const codes = new Set();
  for (const file of [STOCKS, ETFS]) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const columns = line.split(",");
      const ticker = String(columns[0] || "").trim().toUpperCase();
      const place = String(columns[1] || "").trim().toUpperCase();
      if (place !== "IDX" && !ticker.startsWith("IDX:")) continue;
      const code = ticker.split(":").pop();
      if (code) codes.add(code);
    }
  }
  return codes;
}

function nameFromTitle(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  const american = text.match(/^Harga Saham (.+?) \([^)]+\) Hari Ini/i);
  const local = text.match(/^Harga Saham [A-Z0-9.-]+ Hari Ini - (.+?) =/i);
  const name = (american?.[1] || local?.[1] || "").trim();
  if (!name || /\b(waran|warrant|rights?|hmetd|obligasi|bond)\b/i.test(name)) return "";
  return name;
}

async function soldBeyond(page, book, prefix, sitemapUrl, extraCodes) {
  await page.goto(sitemapUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  const codes = await page.evaluate((marker) => {
    return [...document.querySelectorAll("loc")].flatMap((node) => {
      let path = "";
      try { path = new URL(node.textContent).pathname; } catch { return []; }
      if (!path.startsWith(marker)) return [];
      const rest = decodeURIComponent(path.slice(marker.length));
      if (!rest || rest.includes("/")) return [];
      return [rest.toUpperCase()];
    });
  }, prefix);
  const wanted = new Set(codes);
  for (const code of extraCodes) wanted.add(code);
  const missing = [...wanted].filter((code) => code && !book.has(code));
  let added = 0;
  let refused = 0;
  for (let offset = 0; offset < missing.length; offset += 8) {
    const slice = missing.slice(offset, offset + 8);
    const pages = await page.evaluate(async (urls) => {
      return Promise.all(urls.map(async (url) => {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
          const html = await response.text();
          const title = html.match(/<title>([^<]+)/)?.[1] || "";
          return { url, status: response.status, title, buy: /Mulai Investasi/.test(html) };
        } catch {
          return { url, status: 0, title: "", buy: false };
        }
      }));
    }, slice.map((code) => `https://ajaib.co.id${prefix}${encodeURIComponent(code)}`));
    for (const item of pages) {
      const code = decodeURIComponent(item.url.split("/").pop() || "").toUpperCase();
      const name = item.status === 200 && item.buy ? nameFromTitle(item.title) : "";
      if (!name) {
        refused += 1;
        continue;
      }
      book.set(code, name);
      added += 1;
    }
  }
  console.log(`${prefix} ${added} sold beyond the table, ${refused} left out`);
  return book;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
  protocolTimeout: 60000,
});
const page = await browser.newPage();
let us;
let idx;
try {
  us = await readBook(page, US_ROOT);
  idx = await readBook(page, IDX_ROOT);
  await soldBeyond(page, us, "/saham-amerika/aset/", "https://ajaib.co.id/sitemap-saham-amerika.xml", []);
  await soldBeyond(page, idx, "/saham/aset/", "https://ajaib.co.id/sitemap-saham.xml", listedCodes());
  // The explore table links to these fiches, and each fiche answers 404.
  for (const ticker of ["IRDM", "RDW", "VSAT"]) us.delete(ticker);
} finally {
  await page.close();
  await browser.disconnect();
}

const { books, funds } = loadBooks();
const rows = [];
const add = (book, exchange, currency) => {
  for (const [ticker, name] of book) {
    const row = { ticker, name, exchange, currency };
    const found = identity(row, books, funds);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency,
      type: found.type,
      ...(found.isin ? { isin: found.isin } : {}),
      ...(found.matches.length ? { matches: found.matches } : {}),
      raw: [ticker, name, exchange, currency, found.isin].filter(Boolean).join(" "),
    });
  }
};
add(us, "US", "USD");
add(idx, "IDX", "IDR");

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const apple = rows.find((row) => row.ticker === "AAPL" && row.exchange === "US");
const spy = rows.find((row) => row.ticker === "SPY" && row.exchange === "US");
const bca = rows.find((row) => row.ticker === "BBCA" && row.exchange === "IDX");
if (!apple || apple.isin !== "US0378331005" || apple.type !== "STOCK") throw new Error("Apple is missing");
if (!spy || spy.type !== "ETF") throw new Error("SPY is missing");
if (!bca || bca.isin !== "ID1000109507") throw new Error("BBCA is missing");
const adhi = rows.find((row) => row.ticker === "ADHI" && row.exchange === "IDX");
const cnya = rows.find((row) => row.ticker === "CNYA" && row.exchange === "US");
const lq45 = rows.find((row) => row.ticker === "R-LQ45X" && row.exchange === "IDX");
if (!adhi || adhi.type !== "STOCK") throw new Error("ADHI is missing");
if (!cnya || cnya.type !== "ETF") throw new Error("CNYA is missing");
if (!lq45 || lq45.type !== "ETF") throw new Error("R-LQ45X is missing");
if (us.size < 1000) throw new Error(`only ${us.size} US names`);
if (idx.size < 800) throw new Error(`only ${idx.size} IDX names`);

const parsed = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, `${JSON.stringify(parsed, null, 2)}\n`);
const stocks = parsed.filter((row) => row.type === "STOCK").length;
const etfs = parsed.filter((row) => row.type === "ETF").length;
console.log(`wrote ${parsed.length} rows, ${stocks} shares, ${etfs} ETFs`);
