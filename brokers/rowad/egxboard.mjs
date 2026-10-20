// Shared reader for the Egyptian brokers whose public site runs the
// TEA Computers e-trade pages (NewLogin.aspx, Home.aspx). Every page
// carries the price ticker (ctl00_PriceTicker1_TickerDataList, or
// ctrlPriceTicker on some hosts), one entry per line the e-trade system
// quotes: a Reuters code (COMI.CA) and the Arabic name, one in the
// title and the other in the text. A board that prints the same codes
// as a grid can hand its lines to `finish`.
//
// A line is a share unless its name says otherwise: "وثائق" or
// "صندوق" is a fund, an ETF when it is the index fund (EGX30ETF,
// "صناديق المؤشرات"), otherwise a listed mutual or real-estate fund,
// which is left out. A name that starts with "حق" is a subscription
// right. A code that is not a .CA code is a sukuk or bond line. Nile
// Sat (EGSA) is quoted in dollars on the EGX; every other line is in
// pounds. The ISIN is not printed. It is the one the lists
// (assets/stocks.csv, etfs.csv) give that EGX ticker, and the three the
// lists file under another key are below.

import fs from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const DOLLAR = new Set(["EGSA", "SPHT"]);
const STOCK_FLOOR = 200;
// Three shares the lists file under another key: Arabia Investments
// Holding under its old code AIH, Ferchem Misr and National Printing
// under their ISINs. These are the ISINs on those lines.
const ISIN = { AIHC: "EGS21351C019", FERC: "EGS385S1C012", NAPR: "EGS370O1C013" };

// The lists' EGX lines, ticker to ISIN, kept only when the ticker names one.
function listIsins() {
  const found = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    const path = new URL(file, import.meta.url);
    if (!fs.existsSync(path)) continue;
    for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
      const [key, place, isin] = line.split(",");
      if (place !== "EGX" || !/^EG[A-Z0-9]{10}$/.test(isin || "")) continue;
      const ticker = key.split(":").pop();
      if (!found.has(ticker)) found.set(ticker, new Set());
      found.get(ticker).add(isin);
    }
  }
  const book = new Map(Object.entries(ISIN));
  for (const [ticker, isins] of found) if (isins.size === 1 && !book.has(ticker)) book.set(ticker, [...isins][0]);
  return book;
}

export async function pageText(url, tries = 4) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "ar,en;q=0.8" },
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      last = error.message;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`${url}: ${last}`);
}

export function clean(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const CODE = /^([A-Z0-9]+)\.CA$/;

// The ticker entries of a TEA Computers page, as { code, name }.
export function tickerLines(html) {
  const entries = [
    ...html.matchAll(/<(span|a)\b[^>]*\bid="[^"]*TickerDataList_ctl\d+_CompanyLabel"[^>]*>([^<]*)<\/\1>/g),
  ];
  const lines = [];
  for (const [tag, , text] of entries) {
    const title = clean((tag.match(/\btitle="([^"]*)"/) || [])[1]);
    const body = clean(text);
    // The code is the side with no Arabic and no space in it.
    const codeLike = (value) => /^[A-Z0-9._-]+$/i.test(value);
    const [code, name] = codeLike(body) && !codeLike(title) ? [body, title] : [title, body];
    lines.push({ code, name });
  }
  return lines;
}

export async function tickerBoard(url) {
  const html = await pageText(url);
  const lines = tickerLines(html);
  if (lines.length === 0) throw new Error(`${url} has no price ticker`);
  return lines;
}

function tally(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function typeOf(code, name, leftOut) {
  if (/وثائق|صندوق|صناديق/.test(name) || /^EGX\d+ETF$/.test(code)) {
    if (/ETF/i.test(code) || /\bETF\b/i.test(name) || /صناديق المؤشرات/.test(name)) return "ETF";
    return tally(leftOut, "funds that are not ETFs");
  }
  return "STOCK";
}

// Lines { code, name } from a board, to catalogue rows.
export function finish(lines, label) {
  const leftOut = new Map();
  const byTicker = new Map();
  for (const line of lines) {
    const code = clean(line.code).toUpperCase();
    const name = clean(line.name);
    if (/^حق\s/.test(name) || /حق\s*اكتتاب/.test(name) || /_R\d*\.CA$/.test(code)) {
      tally(leftOut, "subscription rights");
      continue;
    }
    if (!CODE.test(code) && (/صكوك|سندات/.test(name) || /^EG[A-Z0-9]{9,10}$/.test(code))) {
      tally(leftOut, "sukuk and bonds");
      continue;
    }
    const match = code.match(CODE);
    if (!match) throw new Error(`${label}: unreadable line ${JSON.stringify(line).slice(0, 120)}`);
    const ticker = match[1];
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(ticker)) throw new Error(`${label}: odd ticker ${ticker}`);
    if (!name) throw new Error(`${label}: ${ticker} has no name`);
    const type = typeOf(ticker, name, leftOut);
    if (type !== "STOCK" && type !== "ETF") continue;
    const before = byTicker.get(ticker);
    if (before) {
      if (before.type !== type) throw new Error(`${label}: ${ticker} is both ${before.type} and ${type}`);
      continue;
    }
    byTicker.set(ticker, { ticker, name, type });
  }

  const isins = listIsins();
  const rows = [...byTicker.values()]
    .sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker))
    .map((line) => ({
      query: isins.get(line.ticker) || line.ticker,
      ticker: line.ticker,
      name: line.name,
      exchange: "EGX",
      mic: "XCAI",
      currency: DOLLAR.has(line.ticker) ? "USD" : "EGP",
      type: line.type,
      ...(isins.has(line.ticker) ? { isin: isins.get(line.ticker) } : {}),
      raw: [`${line.ticker}.CA`, line.name, line.type].join(" "),
    }));

  const shares = rows.filter((row) => row.type === "STOCK").length;
  const funds = rows.filter((row) => row.type === "ETF").length;
  if (shares < STOCK_FLOOR) throw new Error(`${label}: only ${shares} EGX shares (floor ${STOCK_FLOOR})`);
  const skipped = [...leftOut].map(([reason, count]) => `${count} ${reason}`).join(", ");
  console.error(`${label}: ${rows.length} listings: EGX STOCK ${shares}, EGX ETF ${funds}. Left out: ${skipped || "none"}.`);
  return rows;
}
