// What Pluang sells in shares, exchange-traded funds and spot crypto,
// with no login. Indonesian names come from the public search. A line is
// sold when its category is an Indonesian stock and isTradable is true.
// That flag is also true for names the ranked list leaves out. Warrants
// are left out. United States names are the public explore list. Every
// row is a PALN contract and isTradable is true: the order goes to the
// US exchange, and that contract can be held without leverage. The other
// contract only offers 2x and 4x, so it is left out. Spot crypto is sold
// when the search says so, quoted in rupiah. Crypto futures are left out.
// Mutual funds and options are left out.
//
// The explore list names the market, not the exchange inside the United
// States, so that row stays "US". The Indonesian search does not name a
// board, so that row stays IDX. None of these files prints an ISIN. One
// is filled from the shared lists when a single code on the allowed
// places matches. Several matches stay on the row, and so does IDX:TICKER
// when the lists have none: the front searches that set.
//
//   https://api-pluang.pluang.com/api/v4/mobile-app/explore/assets?category=global_equity&page=1&pageSize=20&sortBy=market_cap_desc
//   https://pluang.com/explore/search?query=BBCA
//   https://pluang.com/explore/indo-market/stocks
//
//   node brokers/pluang/pluang_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const US_BOOK = "https://api-pluang.pluang.com/api/v4/mobile-app/explore/assets?category=global_equity&pageSize=20&sortBy=market_cap_desc&page=";
const CRYPTO_BOOK = "https://api-pluang.pluang.com/api/v4/mobile-app/explore/assets?category=cryptocurrency&pageSize=20&sortBy=market_cap_desc&page=";
const CRYPTO_INFO = "https://api-pluang.pluang.com/api/v4/asset/cryptocurrency/web/cryptoCurrencyInfo";
const LEVERAGE = "https://api-pluang.pluang.com/api/v4/asset/global-stock/instruments/alias?stockType=CFD_LEVERAGE";
const SEARCH = "https://pluang.com/explore/search?query=";
const RANKED = "https://pluang.com/explore/indo-market/stocks?page=";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const LEFT_OUT = new Set(["fund", "gold", "options", "crypto_futures", "pocket", "metals", "stock_index", "cfd_leverage"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getText(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
}

function nextData(html, url) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`${url} has no catalogue`);
  return JSON.parse(match[1]);
}

async function searchPage(query, page) {
  const url = `${SEARCH}${encodeURIComponent(query)}&page=${page}`;
  let last = `${url} has no rows`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const data = nextData(await getText(url, "text/html"), url).props?.pageProps?.pageData;
      if (data && Array.isArray(data.assets) && Number.isInteger(data.total) && Number.isInteger(data.totalPageCount)) {
        if (data.total === 0) return { total: 0, totalPageCount: 0, assets: [] };
        return data;
      }
      last = `${url} has no rows`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
}

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    const header = table[0].split(",").map((cell) => cell.trim().toLowerCase());
    if (header[0] !== "ticker" || header[1] !== "exchange" || header[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${header.join(",")}`);
    }
    for (const line of table.slice(1)) {
      const cells = [];
      let field = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
          if (char === '"') {
            if (line[i + 1] === '"') {
              field += '"';
              i += 1;
            } else quoted = false;
          } else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ",") {
          cells.push(field);
          field = "";
        } else field += char;
      }
      cells.push(field);
      const code = String(cells[0] || "").trim().toUpperCase().split(":").pop();
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const isin = String(cells[2] || "").trim().toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
    }
  }
  return index;
}

function placesOf(row) {
  if (row.exchange === "US") return US_PLACES;
  if (row.exchange === "IDX") return ["IDX"];
  return [];
}

const sold = new Map();
const leftOut = new Map();
const notSold = [];
const warrants = new Set();
const badges = new Map();
let dropped = 0;
const truncated = [];

function sameName(left, right) {
  return left.toLowerCase().replace(/[^a-z0-9]/g, "") === right.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function remember(row) {
  const key = `${row.exchange}|${row.ticker}`;
  const prior = sold.get(key);
  if (prior && (prior.type !== row.type || !sameName(prior.name, row.name))) {
    throw new Error(`${row.ticker} is both ${prior.name} and ${row.name}`);
  }
  if (!prior) sold.set(key, row);
}

function takeTile(tile, where) {
  if (!tile) throw new Error(`${where} has a row with no tile`);
  const category = String(tile.category || "").trim();
  const ticker = String(tile.symbol || tile.displaySymbol || "").trim().toUpperCase();
  const name = String(tile.name || "").replace(/\s+/g, " ").trim();
  if (!ticker || !name) throw new Error(`unreadable ${category} row on ${where}`);
  if (tile.isTradable !== true && tile.isTradable !== false) throw new Error(`${ticker} has no buy flag`);
  const labels = Array.isArray(tile.specialLabels) ? tile.specialLabels.map((label) => String(label)) : [];
  for (const label of labels) badges.set(label, (badges.get(label) || 0) + 1);
  if (category === "indo_stock") {
    if (tile.searchLabel !== "Saham Indonesia") throw new Error(`${ticker} is labelled ${tile.searchLabel || "nothing"}`);
    const warrant = ticker.endsWith("-W") || /^Waran\b/i.test(name) || /\bWarrant\b/i.test(name);
    if (warrant) {
      warrants.add(ticker);
      return;
    }
    if (tile.isTradable !== true) {
      notSold.push(ticker);
      return;
    }
    const type = tile.securityType === "ETF" || tile.securityType === "STOCK"
      ? tile.securityType
      : /ETF/i.test(name) ? "ETF" : "STOCK";
    if (tile.securityType && tile.securityType !== type) throw new Error(`${ticker} type is ${tile.securityType}`);
    remember({ ticker, name, exchange: "IDX", currency: "IDR", type });
    return;
  }
  if (category === "cryptocurrency") {
    if (tile.structuralSubGroup !== "spot" || tile.searchLabel !== "Crypto Spot") {
      throw new Error(`${ticker} is ${tile.structuralSubGroup || "unmarked"} crypto`);
    }
    if (tile.isTradable !== true) {
      notSold.push(ticker);
      return;
    }
    const quote = String(tile.chartTicker || "").trim().toUpperCase().split("-").pop();
    if (quote !== "IDR") throw new Error(`${ticker} is quoted ${quote || "nowhere"}`);
    remember({ ticker, name, exchange: "CRYPTO", currency: "IDR", type: "CRYPTO" });
    return;
  }
  if (category === "PALN") {
    if (tile.stockType !== "PALN") {
      leftOut.set(tile.stockType || "PALN", (leftOut.get(tile.stockType || "PALN") || 0) + 1);
      return;
    }
    if (tile.structuralGroup !== "global_equity") throw new Error(`${ticker} is not a US share`);
    if (tile.isTradable !== true) {
      notSold.push(ticker);
      return;
    }
    const type = tile.securityType === "ETF" ? "ETF" : tile.securityType === "STOCK" ? "STOCK" : "";
    const label = type === "ETF" ? "ETF AS" : type === "STOCK" ? "Saham AS" : "";
    if (!type || tile.searchLabel !== label) throw new Error(`${ticker} is ${tile.securityType || "unmarked"} ${tile.searchLabel || ""}`);
    remember({ ticker, name, exchange: "US", currency: "USD", type });
    return;
  }
  if (!LEFT_OUT.has(category)) throw new Error(`unknown category ${category || "unmarked"} on ${ticker}`);
  leftOut.set(category, (leftOut.get(category) || 0) + 1);
}

async function loadUsBook() {
  const first = JSON.parse(await getText(`${US_BOOK}1`, "application/json"));
  const book = first.data;
  if (!book || book.totalCount < 1 || book.totalPageCount < 1) throw new Error("the US list has no page count");
  const pages = [book];
  const queue = [];
  for (let page = 2; page <= book.totalPageCount; page += 1) queue.push(page);
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const page = queue[cursor];
      cursor += 1;
      const body = JSON.parse(await getText(`${US_BOOK}${page}`, "application/json"));
      if (!body.data) throw new Error(`US page ${page} has no rows`);
      pages[page - 1] = body.data;
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));
  let rows = 0;
  for (const page of pages) {
    const assets = page?.assetCategories?.[0]?.assetCategoryData?.[0]?.assets;
    if (!Array.isArray(assets)) throw new Error("a US page has no rows");
    rows += assets.length;
    for (const asset of assets) takeTile(asset.tileInfo, "US list");
  }
  const us = [...sold.values()].filter((row) => row.exchange === "US");
  if (rows !== book.totalCount || us.length !== book.totalCount) {
    throw new Error(`the US list says ${book.totalCount} and prints ${us.length}`);
  }
  console.error(`US: ${us.length}`);
}

await loadUsBook();

async function crawl(query) {
  const first = await searchPage(query, 1);
  if (first.totalPageCount > 5 && query.length < 4) return CHARS.map((char) => query + char);
  if (first.totalPageCount > 5) truncated.push(`${query} ${first.totalPageCount}`);
  const pages = [first];
  const lastPage = Math.min(5, first.totalPageCount);
  for (let page = 2; page <= lastPage; page += 1) pages.push(await searchPage(query, page));
  const count = pages.reduce((sum, page) => sum + page.assets.length, 0);
  if (first.totalPageCount <= 5 && count < first.total) dropped += first.total - count;
  for (const page of pages) {
    for (const asset of page.assets) takeTile(asset.tileInfo, query);
  }
  return [];
}

const queue = [];
for (const left of CHARS) {
  for (const right of CHARS) queue.push(left + right);
}
let pending = queue.length;
let running = 0;
let queries = 0;
await new Promise((resolve, reject) => {
  const kick = () => {
    if (pending === 0 && running === 0) return resolve();
    while (running < 6 && queue.length) {
      const query = queue.shift();
      running += 1;
      crawl(query).then((extra) => {
        queries += 1;
        if (queries % 200 === 0) console.error(`search: ${queries} queries, ${sold.size} names`);
        for (const child of extra) {
          queue.push(child);
          pending += 1;
        }
        pending -= 1;
        running -= 1;
        kick();
      }).catch(reject);
    }
  };
  kick();
});

async function findTile(symbol) {
  const first = await searchPage(symbol, 1);
  const pages = [first];
  for (let page = 2; page <= Math.min(5, first.totalPageCount); page += 1) {
    const found = pages.some((item) => item.assets.some((asset) => String(asset.tileInfo?.symbol || "").toUpperCase() === symbol));
    if (found) break;
    pages.push(await searchPage(symbol, page));
  }
  for (const page of pages) {
    const tile = page.assets.map((asset) => asset.tileInfo).find((item) => String(item?.symbol || "").toUpperCase() === symbol);
    if (tile) return tile;
  }
  return null;
}

const coinInfo = JSON.parse(await getText(CRYPTO_INFO, "application/json"));
if (!Array.isArray(coinInfo.data)) throw new Error("the crypto list has no rows");
for (const coin of coinInfo.data) {
  const symbol = String(coin.symbol || "").trim().toUpperCase();
  if (!symbol || sold.has(`CRYPTO|${symbol}`)) continue;
  const tile = await findTile(symbol);
  if (tile && tile.category === "cryptocurrency") takeTile(tile, symbol);
}

async function shelfSymbols(root) {
  const first = JSON.parse(await getText(`${root}1`, "application/json"));
  const book = first.data;
  if (!book || book.totalCount < 1) throw new Error("a shelf has no page count");
  const symbols = [];
  function take(page) {
    const assets = page?.assetCategories?.[0]?.assetCategoryData?.[0]?.assets;
    if (!Array.isArray(assets)) throw new Error("a shelf page has no rows");
    for (const asset of assets) {
      const symbol = String(asset.tileInfo?.symbol || asset.tileInfo?.displaySymbol || "").trim().toUpperCase();
      if (!symbol) throw new Error("a shelf row has no ticker");
      symbols.push(symbol);
    }
  }
  take(book);
  for (let page = 2; page <= book.totalPageCount; page += 1) {
    const body = JSON.parse(await getText(`${root}${page}`, "application/json"));
    take(body.data);
  }
  if (symbols.length !== book.totalCount || new Set(symbols).size !== book.totalCount) {
    throw new Error(`a shelf says ${book.totalCount} and prints ${symbols.length}`);
  }
  return symbols;
}

for (const symbol of await shelfSymbols(CRYPTO_BOOK)) {
  if (sold.has(`CRYPTO|${symbol}`)) continue;
  const tile = await findTile(symbol);
  if (!tile) throw new Error(`the crypto shelf has ${symbol} and the search does not`);
  takeTile(tile, symbol);
  if (!sold.has(`CRYPTO|${symbol}`)) throw new Error(`the crypto shelf has ${symbol} and the search does not sell it`);
}

function rankedBook(html, url) {
  const book = nextData(html, url).props?.pageProps?.data;
  const assets = book?.assetCategories?.[0]?.assetCategoryData?.[0]?.assets;
  if (!book || !Array.isArray(assets)) throw new Error(`${url} has no ranked rows`);
  if (!Number.isInteger(book.totalCount) || !Number.isInteger(book.totalPageCount)) {
    throw new Error(`${url} has no page count`);
  }
  return { totalCount: book.totalCount, totalPageCount: book.totalPageCount, assets };
}

const ranked = new Set();
const rankedHead = rankedBook(await getText(`${RANKED}1`, "text/html"), `${RANKED}1`);
let rankedRows = 0;
for (let page = 1; page <= rankedHead.totalPageCount; page += 1) {
  const url = `${RANKED}${page}`;
  const book = page === 1 ? rankedHead : rankedBook(await getText(url, "text/html"), url);
  rankedRows += book.assets.length;
  for (const asset of book.assets) {
    const ticker = String(asset.tileInfo?.symbol || asset.tileInfo?.displaySymbol || "").trim().toUpperCase();
    if (!ticker) throw new Error(`${url} has a row with no ticker`);
    ranked.add(ticker);
  }
}
if (rankedRows !== rankedHead.totalCount || ranked.size !== rankedHead.totalCount) {
  throw new Error(`the ranked list says ${rankedHead.totalCount} and prints ${ranked.size}`);
}
for (const ticker of ranked) {
  if (sold.has(`IDX|${ticker}`) || warrants.has(ticker)) continue;
  const found = await searchPage(ticker, 1);
  const tile = found.assets.map((asset) => asset.tileInfo).find((item) => String(item.symbol || "").toUpperCase() === ticker);
  if (!tile) throw new Error(`the ranked list has ${ticker} and the search does not`);
  takeTile(tile, ticker);
  if (!sold.has(`IDX|${ticker}`) && !warrants.has(ticker)) {
    throw new Error(`the ranked list has ${ticker} and the search does not sell it`);
  }
}

const leverage = JSON.parse(await getText(LEVERAGE, "application/json"));
if (!Array.isArray(leverage.data)) throw new Error("the leverage list has no rows");
const leverageOnly = leverage.data.filter((row) => !sold.has(`US|${String(row.cc || "").toUpperCase()}`));

const isins = loadIsinIndex();
let one = 0;
let none = 0;
let several = 0;
const listings = [...sold.values()].map((row) => {
  const found = new Set();
  const book = isins.get(row.ticker);
  for (const place of placesOf(row)) {
    for (const isin of book?.get(place) || []) found.add(isin);
  }
  let isin = "";
  const matches = new Set();
  if (row.type !== "CRYPTO") {
    if (found.size === 1) {
      isin = [...found][0];
      one += 1;
    } else if (found.size === 0) {
      none += 1;
      if (row.exchange === "IDX") matches.add(`IDX:${row.ticker}`);
    } else {
      several += 1;
      for (const place of placesOf(row)) {
        const ids = book?.get(place);
        if (!ids || ids.size === 0) continue;
        matches.add(`${place}:${row.ticker}`);
        for (const id of ids) matches.add(id);
      }
    }
  }
  return {
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    currency: row.currency,
    type: row.type,
    isin,
    ...(matches.size ? { matches: [...matches].sort() } : {}),
    raw: [row.ticker, row.name, row.exchange, isin, row.type].filter(Boolean).join(" "),
  };
});
listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("pluang-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));

for (const ticker of ["JELI", "WIKA", "BATA", "XIIT"]) {
  if (!listings.some((row) => row.exchange === "IDX" && row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}
for (const [ticker, type] of [["AAPL", "STOCK"], ["VOO", "ETF"]]) {
  const row = listings.find((item) => item.exchange === "US" && item.ticker === ticker);
  if (!row || row.type !== type) throw new Error(`missing ${ticker}`);
}
for (const ticker of ["BTC", "SXP"]) {
  const row = listings.find((item) => item.exchange === "CRYPTO" && item.ticker === ticker);
  if (!row || row.type !== "CRYPTO" || row.currency !== "IDR") throw new Error(`missing ${ticker}`);
}

const byBook = new Map();
for (const row of listings) {
  const key = `${row.exchange} ${row.type}`;
  byBook.set(key, (byBook.get(key) || 0) + 1);
}
const skipped = [...leftOut].map(([category, count]) => `${count} ${category}`).join(", ");
console.error(
  `${listings.length} listings (${[...byBook].map(([key, count]) => `${count} ${key}`).join(", ")}). ` +
    `${one} with an ISIN, ${none} unmatched, ${several} ambiguous. ` +
    `Ranked list ${ranked.size}. Warrants left out: ${warrants.size}. ` +
    `Leverage contracts ${leverage.data.length}, each also on the unlevered list, ${leverageOnly.length} with no unlevered line. ` +
    `Left out: ${skipped || "none"}. Not sold: ${[...new Set(notSold)].length}. ` +
    `Search rows the page did not print: ${dropped}. ` +
    `Wide searches stopped at 5 pages: ${truncated.length ? truncated.join(", ") : "none"}.`
);
