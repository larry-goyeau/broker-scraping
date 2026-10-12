// What Erste Biuro Maklerskie sells.
//
// Warsaw shares have no ticker file. The order of 27 June 2025 names the
// category for the regulated market and for the alternative system, so
// the boards are the GPW share list and NewConnect. A line the exchange
// still suspends stays out. GlobalConnect is the other share book: every
// Erste account can trade it, in zloty, and the company list prints the
// ISIN.
//
// Foreign shares are the workbook linked from the foreign-markets page.
// The same page links a bond workbook; cash bonds stay out.
//
// ETFs, ETNs and ETCs, Warsaw and foreign, are the public scanner. It
// says how many rows it holds and pages them twenty at a time.
//
//   https://www.gpw.pl/zawieszenia-i-wykluczenia
//   https://www.bankier.pl/gielda/notowania/akcje
//   https://www.bankier.pl/gielda/notowania/new-connect
//   https://gpwglobalconnect.pl/spolki
//   https://www.erste.pl/klient-indywidualny/oszczednosci-i-inwestycje/rachunki-dla-gield-zagranicznych
//   https://centruminformacji.erste.pl/_fileserver/item/1508657
//   https://www.erste.pl/inwestor/skaneretf
//
//   node brokers/erste/erste_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import https from "node:https";
import { inflateRawSync } from "node:zlib";

const BOARD = "https://www.bankier.pl/gielda/notowania/akcje";
const NC_BOARD = "https://www.bankier.pl/gielda/notowania/new-connect";
const SUSPENSIONS = "https://www.gpw.pl/zawieszenia-i-wykluczenia";
const GC_LIST = "https://gpwglobalconnect.pl/ajaxindex.php";
const FOREIGN_PAGE = "https://www.erste.pl/klient-indywidualny/oszczednosci-i-inwestycje/rachunki-dla-gield-zagranicznych";
const SCANNER = "https://www.erste.pl/inwestor/skaneretf";
const SHARE_FILE = "https://centruminformacji.erste.pl/_fileserver/item/1508657";

// Erste's own market code, from the foreign-account page, to a name the
// venue list matches exactly. GXE is the one code Erste prints for Xetra
// and Frankfurt together; the line is stored on Xetra.
const PLACE = {
  NYS: "NYSE",
  NSD: "NASDAQ",
  GXE: "XETRA",
  LSE: "LSE",
  EFR: "Euronext Paris",
  EUN: "Euronext Amsterdam",
  EUB: "Euronext Brussels",
  EUP: "Euronext Lisbon",
  BIT: "Borsa Italiana",
  BME: "BME",
  SSX: "SIX",
  SSE: "Nasdaq Stockholm",
  HEX: "HEX",
  VSE: "VSE",
};

const SCANNER_PLACE = {
  "london stock exchange": "LSE",
  "xetra & borse frankfurt": "XETRA",
  "xetra & börse frankfurt": "XETRA",
  "gpw warszawa": "GPW",
  "euronext amsterdam": "Euronext Amsterdam",
  "euronext paris": "Euronext Paris",
  "euronext brussels": "Euronext Brussels",
  "euronext lisbon": "Euronext Lisbon",
  "borsa italiana": "Borsa Italiana",
  "bolsa de madrid": "BME",
  "bolsa madrid": "BME",
  "six swiss exchange": "SIX",
  nasdaq: "NASDAQ",
  nyse: "NYSE",
  "nasdaq stockholm": "Nasdaq Stockholm",
  "nasdaq helsinki": "HEX",
  "wiener borse": "VSE",
  "wiener börse": "VSE",
};

const BLOOMBERG = new Set(["US", "LN", "IM", "GY", "GR", "GF", "FP", "NA", "BB", "PL", "SW", "SS", "FH", "AV", "SM", "SQ", "VX"]);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const HTML = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pl,en;q=0.8",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function cellsOf(chunk) {
  return [...chunk.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((match) =>
    normalize(match[1].replace(/<[^>]+>/g, " "))
  );
}

function when(value) {
  const text = normalize(value);
  if (!text) return null;
  const date = new Date(text.replace(" ", "T") + "+02:00");
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

// A row is a live suspension when the exchange still marks it in force
// on that market, and no later lifting covers it.
function suspendedKeys(html, mic) {
  const events = [];
  for (const match of html.matchAll(/<tr[^>]*data-rodzaj-operacji="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const kind = normalize(match[1]).toLowerCase();
    const cells = cellsOf(match[2]);
    if (cells.length < 12 || cells[7] !== mic) continue;
    const published = when(cells[1]);
    const until = when(cells[5]);
    const live = cells[6] === "TAK" && (until == null || until > Date.now());
    const isins = cells[10].split(",").map(toIsin).filter(Boolean);
    const tickers = cells[11]
      .split(",")
      .map((ticker) => normalize(ticker).toUpperCase())
      .filter(Boolean);
    events.push({ kind, published: published ?? 0, live, isins, tickers });
  }
  const latest = new Map();
  for (const event of events) {
    for (const key of [...event.isins, ...event.tickers]) {
      const prior = latest.get(key);
      if (!prior || event.published >= prior.published) latest.set(key, event);
    }
  }
  const blocked = new Set();
  for (const [key, event] of latest) {
    if (event.live && event.kind.startsWith("zawieszenie")) blocked.add(key);
  }
  return blocked;
}

function boardSymbols(html) {
  const body = html.split("<tbody>").at(-1)?.split("</tbody>")[0] ?? "";
  const symbols = [];
  const seen = new Set();
  for (const match of body.matchAll(/quote\.html\?symbol=([^"&]+)/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    symbols.push(match[1]);
  }
  return symbols;
}

// GPW resets an HTTP/2 client. HTTP/1.1 is the path that answers.
function get(url, { stop } = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        ALPNProtocols: ["http/1.1"],
        headers: HTML,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
          res.resume();
          done(get(new URL(res.headers.location, url).href, { stop }, redirects + 1));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          chunks.push(chunk);
          size += chunk.length;
          if (!stop || size < 80_000) return;
          const html = Buffer.concat(chunks).toString("utf8");
          if (!stop(html)) return;
          done({ status: res.statusCode, html });
          req.destroy();
        });
        res.on("end", () => done({ status: res.statusCode, html: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", () => done({ status: res.statusCode, html: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", (error) => {
      if (settled) return;
      reject(error);
    });
    req.setTimeout(40_000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

function postText(url, body, redirects = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        ALPNProtocols: ["http/1.1"],
        headers: {
          ...HTML,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
          res.resume();
          resolve(postText(new URL(res.headers.location, url).href, body, redirects + 1));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`${url} answered ${res.statusCode}`));
            return;
          }
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(40_000, () => req.destroy(new Error("timeout")));
    req.end(body);
  });
}

function bytesOf(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        ALPNProtocols: ["http/1.1"],
        headers: { ...HTML, Accept: "*/*" },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
          res.resume();
          resolve(bytesOf(new URL(res.headers.location, url).href, redirects + 1));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`${url} answered ${res.statusCode}`));
            return;
          }
          resolve(Buffer.concat(chunks));
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(40_000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await get(url);
      if (response.status !== 200) {
        last = `${url} answered ${response.status}`;
        await sleep(400 * (attempt + 1));
        continue;
      }
      return response.html;
    } catch (error) {
      last = `${url} ${error.message}`;
      await sleep(500 * (attempt + 1));
    }
  }
  throw new Error(last || `${url} did not answer`);
}

async function profileHead(symbol) {
  let last = "";
  const url = `https://www.bankier.pl/inwestowanie/profile/quote.html?symbol=${encodeURIComponent(symbol)}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await get(url, {
        stop: (html) => html.includes("data-isin=") && html.includes("data-unit=") && html.includes("a-heading__suffix"),
      });
      if (response.status !== 200) {
        last = `${symbol} profile answered ${response.status}`;
        await sleep(400 * (attempt + 1));
        continue;
      }
      return response.html;
    } catch (error) {
      last = `${symbol} profile ${error.message}`;
      await sleep(500 * (attempt + 1));
    }
  }
  throw new Error(last || `${symbol} profile did not answer`);
}

function listing({ isin, ticker, name, exchange, currency, type }) {
  return {
    query: isin,
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, type].filter(Boolean).join(" "),
    isin,
  };
}

function shortTicker(value) {
  const text = normalize(value).toUpperCase();
  const parts = text.split(" ");
  if (parts.length >= 2 && BLOOMBERG.has(parts.at(-1))) return parts.slice(0, -1).join(" ");
  return text;
}

function productOf(name, assetClass = "") {
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  if (/\bETF\b/i.test(name)) return "ETF";
  if (/towar|surow/i.test(assetClass)) return "ETC";
  return "ETF";
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function unzip(buf) {
  const files = new Map();
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let o = 0;
  while (o + 30 <= b.length && b.readUInt32LE(o) === 0x04034b50) {
    const method = b.readUInt16LE(o + 8);
    const comp = b.readUInt32LE(o + 18);
    const nameLen = b.readUInt16LE(o + 26);
    const extra = b.readUInt16LE(o + 28);
    const name = b.slice(o + 30, o + 30 + nameLen).toString();
    const start = o + 30 + nameLen + extra;
    const data = b.slice(start, start + comp);
    files.set(name, method === 0 ? data : inflateRawSync(data));
    o = start + comp;
  }
  return files;
}

function sheetRows(buf) {
  const files = unzip(buf);
  const shared = [];
  const sharedXml = files.get("xl/sharedStrings.xml");
  if (sharedXml) {
    const xml = sharedXml.toString();
    for (const item of xml.match(/<si[\s\S]*?<\/si>/g) || []) {
      shared.push(decodeXml([...item.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((match) => match[1]).join("")));
    }
  }
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("Erste share workbook has no first sheet");
  const rows = [];
  for (const row of sheet.toString().match(/<row[\s\S]*?<\/row>/g) || []) {
    const cells = {};
    for (const cell of row.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = cell.match(/\br="([A-Z]+)\d+"/);
      const type = cell.match(/\bt="([^"]+)"/);
      const value = cell.match(/<v>([^<]*)<\/v>/);
      if (!ref || !value) continue;
      cells[ref[1]] = type?.[1] === "s" ? shared[Number(value[1])] ?? "" : decodeXml(value[1]);
    }
    rows.push(cells);
  }
  return rows;
}

function shareRows(buf) {
  const rows = [];
  const skipped = [];
  for (const cells of sheetRows(buf)) {
    const isin = toIsin(cells.B);
    const code = normalize(cells.C).toUpperCase();
    if (!isin || !PLACE[code]) {
      if (normalize(cells.A) && normalize(cells.A) !== "Ticker") skipped.push(normalize(cells.A) || isin || code);
      continue;
    }
    const name = normalize(cells.E);
    if (/prawo poboru|prawo do akcji|warrant/i.test(name)) {
      skipped.push(isin);
      continue;
    }
    const currency = normalize(cells.G).toUpperCase();
    const ticker = shortTicker(cells.A);
    if (!ticker || !/^[A-Z]{3}$/.test(currency)) {
      skipped.push(isin);
      continue;
    }
    const type = /\bETF\b/i.test(name) ? "ETF" : /\bETN\b/i.test(name) ? "ETN" : /\bETC\b/i.test(name) ? "ETC" : "STOCK";
    rows.push(listing({ isin, ticker, name, exchange: PLACE[code], currency, type }));
  }
  return { rows, skipped };
}

function scannerValues(chunk) {
  return [...chunk.matchAll(/<span class="value">([\s\S]*?)<\/span>/g)].map((match) =>
    normalize(match[1].replace(/<[^>]+>/g, " "))
  );
}

function scannerRows(html, blocked) {
  const rows = [];
  const skipped = [];
  for (const match of html.matchAll(/<tr class="table_row[\s\S]*?<\/tr>/g)) {
    const values = scannerValues(match[0]);
    const isin = toIsin(values[13]);
    const exchange = SCANNER_PLACE[normalize(values[11]).toLowerCase()];
    const currency = normalize(values[12]).toUpperCase();
    const ticker = shortTicker(String(values[1] || "").split(",")[0]);
    const name = values[0] || "";
    if (!isin || !exchange || !ticker || !/^[A-Z]{3}$/.test(currency)) {
      skipped.push(normalize(values[1]) || isin || normalize(values[11]));
      continue;
    }
    if (exchange === "GPW" && (blocked.has(isin) || blocked.has(ticker))) {
      skipped.push(`${ticker} ${isin}`);
      continue;
    }
    rows.push(listing({ isin, ticker, name, exchange, currency, type: productOf(name, values[4]) }));
  }
  return { rows, skipped };
}

function globalConnectRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const chunk = match[0];
    const isin = toIsin(chunk.match(/isin=([A-Z0-9]{12})/)?.[1]);
    const ticker = normalize(chunk.match(/class="grey">\(([^)]+)\)/)?.[1]).toUpperCase();
    const name = normalize(chunk.match(/class="name">\s*([\s\S]*?)<span/)?.[1]);
    if (!isin || !ticker || /^ETF/i.test(ticker) || /\bETF\b/i.test(name)) continue;
    rows.push(listing({ isin, ticker, name, exchange: "GlobalConnect", currency: "PLN", type: "STOCK" }));
  }
  return rows;
}

function profileRow(html, symbol, exchange) {
  const isin = toIsin(html.match(/data-isin="([^"]+)"/)?.[1]);
  const unit = html.match(/data-unit="([^"]+)"/)?.[1] ?? "";
  if (!isin || unit !== "zł") return null;
  const suffix = normalize(html.match(/a-heading__suffix[^"]*">([^<]+)/)?.[1]);
  const wrapped = suffix.match(/^(.*)\(([^)]+)\)\s*$/);
  const ticker = normalize(wrapped ? wrapped[2] : symbol).toUpperCase();
  const name = normalize(wrapped ? wrapped[1] : suffix);
  if (!ticker || /prawo poboru|prawo do akcji|warrant/i.test(name)) return null;
  return listing({ isin, ticker, name, exchange, currency: "PLN", type: "STOCK" });
}

const suspensionHtml = await textOf(SUSPENSIONS);
const boardHtml = await textOf(BOARD);
const ncHtml = await textOf(NC_BOARD);
const symbols = boardSymbols(boardHtml);
const ncSymbols = boardSymbols(ncHtml);
if (symbols.length < 300) throw new Error(`GPW share board has ${symbols.length} symbols`);
if (ncSymbols.length < 250) throw new Error(`NewConnect board has ${ncSymbols.length} symbols`);
const mainBlocked = suspendedKeys(suspensionHtml, "XWAR");
const ncBlocked = suspendedKeys(suspensionHtml, "XNCO");
if (mainBlocked.size < 5) throw new Error(`GPW suspension page named ${mainBlocked.size} live main-market keys`);

const jobs = [
  ...symbols.map((symbol) => ({ symbol, exchange: "GPW", blocked: mainBlocked })),
  ...ncSymbols.map((symbol) => ({ symbol, exchange: "NewConnect", blocked: ncBlocked })),
];
const rows = [];
const leftOut = [];
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor];
    cursor += 1;
    if (job.blocked.has(job.symbol.toUpperCase())) {
      leftOut.push(`${job.exchange} ${job.symbol}`);
      continue;
    }
    const html = await profileHead(job.symbol);
    const row = profileRow(html, job.symbol, job.exchange);
    if (!row) {
      leftOut.push(`${job.exchange} ${job.symbol}`);
      continue;
    }
    if (job.blocked.has(row.isin) || job.blocked.has(row.ticker)) {
      leftOut.push(`${job.exchange} ${job.symbol} ${row.isin}`);
      continue;
    }
    rows.push(row);
  }
}
await Promise.all(Array.from({ length: 12 }, worker));

const seen = new Set();
const results = [];
function addRow(row) {
  const key = `${row.isin}:${row.exchange}:${row.currency}`;
  if (seen.has(key)) return false;
  seen.add(key);
  results.push(row);
  return true;
}
let newConnect = 0;
let globalConnect = 0;
for (const row of rows) {
  if (addRow(row) && row.exchange === "NewConnect") newConnect += 1;
}
const connectBook = globalConnectRows(await postText(GC_LIST, "format=html&lang=PL&offset=0&limit=500&action=GCCompany&start=listAjax&order=gls_nazwa&order_type=ASC&searchText="));
for (const row of connectBook) if (addRow(row)) globalConnect += 1;

const foreignPage = await textOf(FOREIGN_PAGE);
if (!foreignPage.includes("/_fileserver/item/1508657")) {
  throw new Error("Erste foreign-markets page no longer links the share workbook");
}
const shareBook = shareRows(await bytesOf(SHARE_FILE));
let foreign = 0;
for (const row of shareBook.rows) if (addRow(row)) foreign += 1;

const scannerHtml = await textOf(SCANNER);
const scannerCount = Number(scannerHtml.match(/dataInventoryGrid__pagesTotalRowsCount">(\d+)/)?.[1]);
const component = scannerHtml.match(/component\.id=(\d+)/)?.[1];
const lastPage = Number(scannerHtml.match(/page=(\d+)/g)?.map((part) => Number(part.slice(5))).sort((a, b) => b - a)[0]);
if (!(scannerCount >= 600) || !component || !(lastPage >= 30)) {
  throw new Error(`Erste ETF scanner did not publish its pager (${scannerCount} rows, page ${lastPage})`);
}
const scanned = scannerRows(scannerHtml, mainBlocked);
const pages = [];
for (let page = 2; page <= lastPage; page += 1) {
  const href =
    `${SCANNER}?action=component_request.action&tableAction=setCurrentPage` +
    `&component.action=tableStateChange&component.id=${component}&page=${page}`;
  pages.push(textOf(href).then((html) => scannerRows(html, mainBlocked)));
}
const scannerPages = [scanned, ...(await Promise.all(pages))];
let scannerAdded = 0;
const scannerSkipped = [];
for (const page of scannerPages) {
  scannerSkipped.push(...page.skipped);
  for (const row of page.rows) if (addRow(row)) scannerAdded += 1;
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});

const outputPath = new URL("erste-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(stampRows(withoutObligations(results)), null, 2));

const byIsin = new Set(results.map((row) => row.isin));
const missing = ["PLPKN0000018", "PLGPW0000017", "IE00B5BMR087", "LU0496786574"].filter((isin) => !byIsin.has(isin));
const stillIn = ["PLENERG00022", "PLINTGR00013", "PLIZBLK00010"].filter((isin) => byIsin.has(isin));
const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const warsawShares = results.filter((row) => row.exchange === "GPW" && row.type === "STOCK").length;
const appleHere = results.some((row) => row.isin === "US0378331005" && row.exchange === "GlobalConnect" && row.currency === "PLN");
if (missing.length || stillIn.length || warsawShares < 350 || foreign < 2500 || scannerAdded < 500 || newConnect < 250 || globalConnect < 40 || !appleHere) {
  throw new Error(
    `Erste catalogue check failed: ${results.length} rows, Warsaw shares ${warsawShares}, NewConnect ${newConnect}, GlobalConnect ${globalConnect}, foreign ${foreign}, scanner ${scannerAdded}, missing ${missing.join(",") || "none"}, still in ${stillIn.join(",") || "none"}`
  );
}
if (scannerSkipped.length) console.error(`Scanner left out ${scannerSkipped.length}: ${scannerSkipped.slice(0, 12).join(" | ")}`);
if (shareBook.skipped.length) console.error(`Share file left out ${shareBook.skipped.length}: ${shareBook.skipped.slice(0, 8).join(" | ")}`);
console.error(
  `${results.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). ` +
    `Warsaw shares ${warsawShares}, NewConnect ${newConnect}, GlobalConnect ${globalConnect}, left out ${leftOut.length}. Foreign shares added ${foreign}. Scanner added ${scannerAdded} of ${scannerCount}.`
);
