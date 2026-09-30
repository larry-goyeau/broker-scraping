// What Boubyan Capital sells as a share or an ETF. The brokerage page
// links one PDF per market, and each PDF is the sharia list available
// for trading that quarter. The PDF has no ISIN. One is copied from
// stocks.csv and etfs.csv when that ticker, on that venue, points to a
// single ISIN. Sukuk are sold and have no list. The page does not link
// an over-the-counter file.
//
// https://boubyancapital.com/brokerage/
//   A row with an exchange code at the end is that venue. Kuwait, Egypt
//   and the Gulf name the market in the section title and put the
//   ticker and the English name on the line. A name that contains ETF
//   is an ETF. London and CHIX print no currency. The Kuwait, Gulf and
//   on every sheet; it is not a second list.
//
//   node boubyan/boubyan_scraping.mjs

import { stampRows } from "../accepted.mjs";
import { parseCsv } from "../indianCash.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const PAGE = "https://boubyancapital.com/brokerage/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const VENUE = /^(NYSE|NSDQ|AMEX|CHIX|LSE|HKEX|XTKS|XKRX|XSHE|XSHG|CNSGSE)$/;
const CURRENCY = {
  NYSE: "USD",
  NSDQ: "USD",
  AMEX: "USD",
  HKEX: "HKD",
  XTKS: "JPY",
  XKRX: "KRW",
  XSHE: "CNY",
  XSHG: "CNY",
  CNSGSE: "CNY",
  KSE: "KWD",
  EGX: "EGP",
  Saudi: "SAR",
  UAE: "AED",
  Qatar: "QAR",
  Bahrain: "BHD",
  Oman: "OMR",
};

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

async function pdfOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/pdf" },
        signal: controller.signal,
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${url} did not return a PDF`);
        return bytes;
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function listsFrom(html) {
  const hrefs = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((match) => new URL(match[1], PAGE).href);
  const lists = [...new Set(hrefs.filter((href) => /tradinglist|kse-list|gcc-list|egypt-list/i.test(href)))];
  if (!lists.length) throw new Error("the brokerage page linked no trading list");
  return lists;
}

function pdfLines(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz

doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
rows = []
for page in doc:
    words = sorted(page.get_text("words"), key=lambda w: (round(w[1], 1), w[0]))
    current = []
    last = None
    for x0, y0, x1, y1, text, *_rest in words:
        text = text.strip()
        if not text:
            continue
        if last is not None and abs(y0 - last) > 2 and current:
            rows.append(" ".join(current))
            current = []
        current.append(text)
        last = y0
    if current:
        rows.append(" ".join(current))
json.dump(rows, sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.error || python.status !== 0) {
    const detail = python.stderr?.toString() || python.error?.message || "";
    throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : detail.slice(0, 400));
  }
  return JSON.parse(python.stdout.toString());
}

function marketOf(line) {
  const text = line.replace(/\s+/g, " ");
  if (/Kuwait Stock Exchange/i.test(text)) return "KSE";
  if (/Egyptian Exchange/i.test(text)) return "EGX";
  if (/Saudi Market/i.test(text)) return "Saudi";
  if (/UAE Stock Markets/i.test(text)) return "UAE";
  if (/Oman Stock Market/i.test(text)) return "Oman";
  if (/Qatar Stock Market/i.test(text)) return "Qatar";
  if (/Bahrain Stock Market/i.test(text)) return "Bahrain";
  return "";
}

function quotedRow(line) {
  const match = line.match(/^(\d+)\s+(.+)\s+([A-Z][A-Z0-9]{2,7})$/);
  if (!match || !VENUE.test(match[3])) return null;
  const parts = match[2].split(/\s+/);
  const ticker = [];
  for (let i = 0; i < parts.length; i += 1) {
    const token = parts[i];
    const symbol = /^[A-Z0-9][A-Z0-9.\-]*$/.test(token);
    if (i === 0 && symbol) {
      ticker.push(token);
      continue;
    }
    if (ticker.length && /^(PR|WS|UN|RT|U|W)$/.test(token)) {
      ticker.push(token);
      continue;
    }
    if (ticker.length && token.length === 1 && symbol) {
      ticker.push(token);
      continue;
    }
    break;
  }
  const name = parts.slice(ticker.length).join(" ").replace(/\s+/g, " ").trim();
  if (!ticker.length || !name) return null;
  return { ticker: ticker.join(" "), name, exchange: match[3] };
}

function localRow(line) {
  const cleaned = line.replace(/[]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((token) => /^[\x00-\x7F]+$/.test(token));
  const latin = tokens.filter((token) => /[A-Za-z0-9]/.test(token));
  if (latin.length < 2) return null;
  let ticker = "";
  let start = 0;
  if (/^\d{3,5}$/.test(latin[0])) {
    ticker = latin[0];
    start = 1;
  } else if (/^[A-Z][A-Z0-9]{1,14}$/.test(latin[0])) {
    ticker = latin[0];
    start = 1;
  }
  if (!ticker) return null;
  const name = [];
  for (const token of latin.slice(start)) {
    if (/^\d+$/.test(token)) continue;
    if (/[a-z]/.test(token) || /^(KSCP|KSCC|KPSC|KSC|PJSC|SJSC|JSC|CJSC|SAOG|QPSC|SAE|QSC|BSC|WLL|PLC|Ltd|Inc|Co)$/.test(token)) {
      name.push(token.replace(/\.$/, ""));
    }
  }
  const printed = name.join(" ").replace(/\s+/g, " ").trim();
  if (printed.length < 3) return null;
  return { ticker, name: printed };
}

// The PDF prints a ticker, not an ISIN. stocks.csv and etfs.csv are keyed
// by venue and ticker. A ticker that points at two ISINs on the same venue
// is left blank. A US ticker filed on the wrong American venue is kept when
// the other American venues agree on one ISIN. A ticker found on some other
// venue is kept only when that venue's name starts with the same word.
const ISIN_VENUES = {
  NYSE: ["NYSE"],
  NSDQ: ["NASDAQ"],
  AMEX: ["AMEX"],
  LSE: ["LSE", "LSE_SETS", "LSE_SEAQ", "LSIN"],
  HKEX: ["HKEX"],
  XTKS: ["TSE", "TYO"],
  XKRX: ["KRX"],
  XSHE: ["SZSE"],
  XSHG: ["SSE"],
  CNSGSE: ["SSE"],
  KSE: ["KSE"],
  EGX: ["EGX"],
  Saudi: ["TADAWUL"],
  Qatar: ["QSE"],
  Bahrain: ["BAHRAIN"],
  UAE: ["ADX", "DFM"],
};
const CHIX_VENUES = [
  "LSE", "LSE_SETS", "LSE_SEAQ", "LSIN", "XETR", "GETTEX", "FWB", "DUS", "MUN",
  "HAM", "HAN", "SWB", "TRADEGATE", "EURONEXT", "MIL", "SIX", "VIE", "CBOE",
  "BME", "OSL", "OMXSTO", "OMXHEX", "OMXCOP", "NGM",
];
const US_VENUES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const NAME_DROP = new Set(["PLC", "LTD", "LIMITED", "CO", "COMPANY", "INC", "CORP", "CORPORATION", "PJSC", "SAOG", "KSCP", "ETF", "TRUST", "GROUP", "HOLDINGS", "SA", "AG", "NV", "SE", "AB", "KK", "JSC", "THE", "AND", "OF", "DE", "CLASS", "SHARES", "SHS", "FUND", "ASA", "OYJ", "AS"]);
const NAME_GENERIC = new Set(["ENERGY", "BUSINESS", "TECHNOLOGY", "SOFTWARE", "INTERNATIONAL", "CAPITAL", "FINANCE", "BANK", "INVESTMENT", "GLOBAL", "RESOURCES", "MINING", "INDUSTRIES", "SERVICES", "SOLUTIONS", "SYSTEMS", "DIGITAL", "HEALTH", "POWER", "MARKET", "MARKETS", "EMERGING", "INDEX", "UTILITIES", "FINANCIAL", "PARTNERS", "CHINA", "AMERICAN", "NATIONAL", "FIRST", "NEW", "GENERAL", "UNITED"]);

function nameTokens(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !NAME_DROP.has(token));
}

function catalogueIsins() {
  const byVenue = new Map();
  const byTicker = new Map();
  for (const file of ["../stocks.csv", "../etfs.csv"]) {
    for (const row of parseCsv(fs.readFileSync(new URL(file, import.meta.url), "utf8"))) {
      const venue = String(row.exchange || "").toUpperCase();
      const ticker = String(row.ticker || "").split(":").pop().trim().toUpperCase();
      const isin = String(row.isin || "").trim().toUpperCase();
      if (!ticker || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
      if (!byVenue.has(venue)) byVenue.set(venue, new Map());
      const tickers = byVenue.get(venue);
      if (!tickers.has(ticker)) tickers.set(ticker, new Set());
      tickers.get(ticker).add(isin);
      if (!byTicker.has(ticker)) byTicker.set(ticker, new Map());
      const named = byTicker.get(ticker);
      if (!named.has(isin)) named.set(isin, new Set());
      const first = nameTokens(row.name)[0];
      if (first) named.get(isin).add(first);
    }
  }
  return { byVenue, byTicker };
}

function oneIsin(byVenue, venues, ticker) {
  const found = new Set();
  for (const venue of venues) {
    const hit = byVenue.get(venue)?.get(ticker);
    if (hit) for (const isin of hit) found.add(isin);
  }
  return found.size === 1 ? [...found][0] : "";
}

export function attachIsins(rows, index = catalogueIsins()) {
  const { byVenue, byTicker } = index;
  let filled = 0;
  for (const row of rows) {
    const ticker = String(row.ticker || "").toUpperCase().trim();
    const venues = ISIN_VENUES[row.exchange] || (row.exchange === "CHIX" ? CHIX_VENUES : null);
    let isin = venues ? oneIsin(byVenue, venues, ticker) : "";
    if (!isin && (row.exchange === "NYSE" || row.exchange === "NSDQ" || row.exchange === "AMEX")) {
      isin = oneIsin(byVenue, US_VENUES, ticker);
    }
    if (!isin) {
      const keys = [ticker];
      const stem = ticker.split(/\s+/)[0];
      if (row.exchange === "HKEX" && /^\d+$/.test(stem)) keys.push(stem);
      const own = nameTokens(row.name)[0];
      for (const key of keys) {
        const hit = byTicker.get(key);
        if (!hit || hit.size !== 1 || !own || own.length < 4 || NAME_GENERIC.has(own)) continue;
        const [only, firsts] = [...hit][0];
        if (firsts.has(own)) {
          isin = only;
          break;
        }
      }
    }
    row.isin = isin;
    if (isin) filled += 1;
  }
  return filled;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain && process.argv.includes("--isins")) {
  const file = new URL("boubyan-parsed.json", import.meta.url);
  const listed = JSON.parse(fs.readFileSync(file, "utf8"));
  const filled = attachIsins(listed);
  fs.writeFileSync(file, JSON.stringify(listed, null, 2));
  console.error(`${filled} ISINs on ${listed.length} listings`);
}

if (isMain && !process.argv.includes("--isins")) {
const html = await textOf(PAGE);
const lists = listsFrom(html);
const rows = [];
const seen = new Set();

for (const url of lists) {
  let market = "";
  for (const line of pdfLines(await pdfOf(url))) {
    const named = marketOf(line);
    if (named) market = named;
    if (/^List of |^No\.?\s|^No Name |Premier Market|Main Market|Exited \/ De-listed|Issue Date/i.test(line)) {
      skip("heading");
      continue;
    }
    const quoted = quotedRow(line);
    const local = quoted ? null : localRow(line);
    const picked = quoted || (market && local ? { ...local, exchange: market } : null);
    if (!picked) {
      skip("not a share");
      continue;
    }
    const exchange = picked.exchange;
    const currency = CURRENCY[exchange] || "";
    const key = `${exchange}|${picked.ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const type = /\bETF\b/i.test(picked.name) ? "ETF" : "STOCK";
    rows.push({
      query: picked.ticker,
      ticker: picked.ticker,
      name: picked.name,
      exchange,
      currency,
      type,
      raw: [picked.ticker, picked.name, exchange, currency, type].join(" "),
      isin: "",
    });
  }
}

rows.sort((left, right) => {
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

const filled = attachIsins(rows);
fs.writeFileSync(new URL("boubyan-parsed.json", import.meta.url), JSON.stringify(stampRows(rows), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${lists.length} lists, ${rows.length} listings, ${filled} ISINs ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
}
