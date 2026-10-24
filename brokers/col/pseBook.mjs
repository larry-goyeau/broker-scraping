// The Philippine Stock Exchange book, for the brokers that sell online
// every non-suspended security listed on the PSE (COL Financial, MyTrade,
// 2TradeAsia, UTrade, Landbank Securities, Timson Securities, Mercantile
// Securities). None of them prints its own list, so the exchange's list is
// read: the PSE Edge company directory gives every listed company, and the
// stock page of each company names each of its lines and says whether it
// is Open or Suspended. A suspended line stays out. TradingView supplies
// the description, the currency and the ETF mark.
//
// A warrant and a right stay out. A pre-IPO stays out. A bond stays out.
// A line with no ISIN stays out.
//
//   https://edge.pse.com.ph/companyDirectory/form.do
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=SM&exchange=PSE&lang=en&domain=production&search_type=stocks
//
// The crawl (about 320 page loads) is kept for 12 hours in the system temp
// folder, so the scrapers run back to back read the PSE once.

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const DIRECTORY = "https://edge.pse.com.ph/companyDirectory/search.ax";
const STOCK = "https://edge.pse.com.ph/companyPage/stockData.do";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EQUITY = new Set(["common", "preferred", "philippine deposit receipts"]);
const CASH = new Set(["PHP", "USD"]);
const CACHE = path.join(os.tmpdir(), "pse-book-cache.json");
const CACHE_HOURS = 12;

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

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

async function getText(url, headers) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, ...headers },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

async function tvPage(searchType, start) {
  const url = `${SEARCH}?text=&exchange=PSE&lang=en&domain=production&search_type=${searchType}&start=${start}`;
  const text = await getText(url, { Origin: "https://www.tradingview.com" });
  const body = JSON.parse(text);
  if (!Array.isArray(body.symbols) || !Number.isInteger(body.symbols_remaining)) {
    throw new Error(`PSE ${searchType} has no page`);
  }
  return body;
}

async function tradingView() {
  const found = new Map();
  for (const searchType of ["stocks", "funds"]) {
    let start = 0;
    let remaining = 1;
    while (remaining > 0) {
      const body = await tvPage(searchType, start);
      remaining = body.symbols_remaining;
      for (const symbol of body.symbols) {
        if (symbol.exchange !== "PSE") continue;
        const ticker = normalize(symbol.symbol).toUpperCase();
        if (!ticker) continue;
        const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs : [];
        const prior = found.get(ticker);
        const row = {
          ticker,
          name: normalize(symbol.description),
          type: normalize(symbol.type).toLowerCase(),
          specs,
          currency: normalize(symbol.currency_code).toUpperCase(),
          isin: isinOf(symbol.isin),
        };
        if (!prior || specs.includes("etf")) found.set(ticker, row);
      }
      start += body.symbols.length;
      if (!body.symbols.length) remaining = 0;
    }
  }
  return found;
}

function field(html, label) {
  const match = html.match(new RegExp(`<th>\\s*${label}\\s*</th>\\s*<td[^>]*>\\s*([^<]*)`, "i"));
  return match ? normalize(match[1]) : "";
}

function optionsOf(html) {
  const out = [];
  const re = /<option\b([^>]*)>([^<]*)<\/option>/gi;
  let match;
  while ((match = re.exec(html))) {
    const id = (match[1].match(/value="(\d+)"/) || [])[1];
    const symbol = normalize(match[2]).toUpperCase();
    if (!id || !symbol) continue;
    out.push({ id, symbol, selected: /\bselected\b/i.test(match[1]) });
  }
  return out;
}

function companyName(html) {
  const match = html.match(/class="compInfo"[\s\S]*?<p[^>]*>([^<]+)/i);
  return match ? normalize(match[1]) : "";
}

function readSecurity(html, symbol) {
  const status = field(html, "Status");
  const issue = field(html, "Issue Type");
  const isin = isinOf(field(html, "ISIN"));
  const name = companyName(html);
  if (!symbol || !issue) throw new Error(`${symbol || "a line"} has no issue type`);
  return { symbol, status, issue, isin, name };
}

async function directoryIds() {
  const first = await getText(`${DIRECTORY}?pageNo=1`);
  const pages = Number((first.match(/\[\s*\d+\s*\/\s*(\d+)\s*\]/) || [])[1]);
  if (!pages) throw new Error("the PSE directory has no page count");
  const htmls = [first];
  for (let page = 2; page <= pages; page += 1) htmls.push(await getText(`${DIRECTORY}?pageNo=${page}`));
  const ids = new Set();
  for (const html of htmls) {
    for (const match of html.matchAll(/cmDetail\('(\d+)'/g)) ids.add(match[1]);
  }
  if (ids.size < 250) throw new Error(`only ${ids.size} PSE companies`);
  return [...ids];
}

async function companySecurities(cmpyId) {
  const first = await getText(`${STOCK}?cmpy_id=${cmpyId}`);
  const options = optionsOf(first);
  if (!options.length) throw new Error(`company ${cmpyId} lists no security`);
  const selected = options.find((option) => option.selected) || options[0];
  const rows = [readSecurity(first, selected.symbol)];
  for (const option of options) {
    if (option.id === selected.id) continue;
    const html = await getText(`${STOCK}?cmpy_id=${cmpyId}&security_id=${option.id}`);
    const shown = optionsOf(html).find((item) => item.selected);
    rows.push(readSecurity(html, shown?.symbol || option.symbol));
  }
  return rows;
}

async function pool(items, width, run) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await run(items[index]);
    }
  }
  await Promise.all(Array.from({ length: width }, worker));
  return out;
}

// The raw crawl: every PSE line with its status, and TradingView's quotes.
async function crawl() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < CACHE_HOURS * 3600_000 && cached.books?.length) {
      console.error(`PSE book read from ${CACHE}`);
      return { books: cached.books, quotes: new Map(cached.quotes) };
    }
  } catch {}
  const quotes = await tradingView();
  const companies = await directoryIds();
  console.error(`${companies.length} companies, ${quotes.size} TradingView lines`);
  const books = (await pool(companies, 6, companySecurities)).flat();
  // The blank-text listing sometimes skips a line (SLF on 2026-10-24); a
  // search on the symbol itself still finds it.
  for (const line of books) {
    if (quotes.has(line.symbol) || line.status.toLowerCase() !== "open") continue;
    const url = `${SEARCH}?text=${encodeURIComponent(line.symbol)}&exchange=PSE&lang=en&domain=production&search_type=stocks`;
    const body = JSON.parse(await getText(url, { Origin: "https://www.tradingview.com" }));
    const symbol = (body.symbols || []).find((item) => item.exchange === "PSE" && normalize(item.symbol).toUpperCase() === line.symbol);
    if (!symbol) continue;
    quotes.set(line.symbol, {
      ticker: line.symbol,
      name: normalize(symbol.description),
      type: normalize(symbol.type).toLowerCase(),
      specs: Array.isArray(symbol.typespecs) ? symbol.typespecs : [],
      currency: normalize(symbol.currency_code).toUpperCase(),
      isin: isinOf(symbol.isin),
    });
  }
  try {
    fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), books, quotes: [...quotes] }));
  } catch {}
  return { books, quotes };
}

// Every open PSE equity line, as catalogue rows (no mic), sorted by type
// then ticker; plus the suspended tickers and the lines left out.
export async function pseBook() {
  const { books, quotes } = await crawl();
  const suspended = [];
  const leftOut = [];
  const listed = [];
  const seen = new Set();

  for (const line of books) {
    if (seen.has(line.symbol)) throw new Error(`${line.symbol} is listed twice`);
    seen.add(line.symbol);
    const status = line.status.toLowerCase();
    if (status === "suspended") {
      suspended.push(line.symbol);
      continue;
    }
    if (!status) {
      leftOut.push(`${line.symbol} no status`);
      continue;
    }
    if (status !== "open") throw new Error(`${line.symbol} status is ${line.status}`);
    const quote = quotes.get(line.symbol);
    const specs = quote?.specs || [];
    const issue = line.issue.toLowerCase();
    if (issue.includes("warrant") || issue.includes("right") || quote?.type === "warrant" || specs.includes("warrant") || specs.includes("right")) {
      leftOut.push(`${line.symbol} ${line.issue}`);
      continue;
    }
    if (specs.includes("pre-ipo")) {
      leftOut.push(`${line.symbol} pre-ipo`);
      continue;
    }
    if (!EQUITY.has(issue)) throw new Error(`${line.symbol} issue type is ${line.issue}`);
    if (!line.isin) {
      leftOut.push(`${line.symbol} no ISIN`);
      continue;
    }
    const type = specs.includes("etf") ? "ETF" : "STOCK";
    const currency = quote?.currency || (line.isin.startsWith("PH") ? "PHP" : "");
    if (!CASH.has(currency)) throw new Error(`${line.symbol} is quoted ${currency || "nowhere"}`);
    const name = quote?.name || line.name;
    if (!name) throw new Error(`${line.symbol} has no name`);
    listed.push({
      query: line.symbol,
      ticker: line.symbol,
      name,
      exchange: "PSE",
      currency,
      type,
      isin: line.isin,
      raw: [line.symbol, name, "PSE", line.isin, type].join(" "),
    });
  }

  listed.sort((left, right) => {
    const byType = left.type.localeCompare(right.type);
    if (byType !== 0) return byType;
    return left.ticker.localeCompare(right.ticker);
  });

  // FMETF was renamed AETF (same ISIN PH0000063026) in 2026.
  for (const ticker of ["SM", "ALI", "BDO", "AETF", "SMC2L"]) {
    if (!listed.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
  }
  if (listed.some((row) => row.ticker === "AAA")) throw new Error("AAA is suspended and was kept");
  const shares = listed.filter((row) => row.type === "STOCK").length;
  const etfs = listed.filter((row) => row.type === "ETF").length;
  if (shares < 200) throw new Error(`only ${shares} shares`);
  if (etfs < 1) throw new Error(`only ${etfs} ETFs`);
  if (leftOut.length) console.error(`${leftOut.length} lines left out: ${leftOut.sort().join(", ")}`);
  if (leftOut.length > 40) throw new Error(`${leftOut.length} lines were left out`);
  return { listed, suspended, leftOut };
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types; `mic` adds the venue's MIC to each row.
export async function writePseCatalogue(here, file, { types = ["STOCK", "ETF"], mic = "" } = {}) {
  const { listed, suspended } = await pseBook();
  const rows = listed
    .filter((row) => types.includes(row.type))
    .map(({ query, ticker, name, exchange, ...rest }) =>
      mic ? { query, ticker, name, exchange, mic, ...rest } : { query, ticker, name, exchange, ...rest }
    );
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const count = (type) => kept.filter((row) => row.type === type).length;
  const dropped = listed.filter((row) => !types.includes(row.type)).length;
  console.error(
    `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
      `(${count("STOCK")} STOCK, ${count("ETF")} ETF)`
  );
  console.error(`${suspended.length} suspended left out`);
  if (dropped) console.error(`${dropped} lines of another type left out`);
  if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
  return kept;
}
