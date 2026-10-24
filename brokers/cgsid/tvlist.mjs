// Shared by the whole-exchange catalogues of ../cgsid, ../fac (Indonesia
// Stock Exchange) and ../ziraat/bist.mjs (Borsa Istanbul, for ../ziraat,
// ../tera and ../ahlatci). TradingView's public symbol search names, for a
// place, each line's code, name, ISIN, currency and kind (common share,
// preferred share, ETF). It is the code ../bni and ../bri run inline.
//
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=BB&exchange=IDX&lang=en&domain=production&search_type=stocks
//
// idxListings(): every common or preferred share and every ETF TradingView
// lists on IDX. The exchange's own helper (idx.co.id) still names lines it
// has delisted and refuses a plain request. A one-letter search stops
// before it has named every share, so the crawl is two letters. A
// real-estate investment fund (DIRE) is neither a share nor an ETF.

const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

export function kindOf(symbol) {
  const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs : [];
  if (symbol.type === "stock" && (specs.includes("common") || specs.includes("preferred"))) return "STOCK";
  if (specs.includes("etf")) return "ETF";
  return "";
}

// One page of a search on one place.
export async function searchPage(text, exchange, searchType, start = 0) {
  const url =
    `${SEARCH}?text=${encodeURIComponent(text)}&exchange=${exchange}&lang=en&domain=production` +
    `&search_type=${searchType}&start=${start}`;
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Origin: "https://www.tradingview.com" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (!Array.isArray(body.symbols) || !Number.isInteger(body.symbols_remaining)) {
          throw new Error(`${text} ${searchType} has no page`);
        }
        return body;
      }
      last = `${response.status} ${text} ${searchType}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

// Every line a search for `text` returns on one place, all pages.
export async function searchAll(text, exchange, searchType) {
  const out = [];
  let start = 0;
  let remaining = 1;
  while (remaining > 0) {
    const body = await searchPage(text, exchange, searchType, start);
    remaining = body.symbols_remaining;
    out.push(...body.symbols);
    start += body.symbols.length;
    if (!body.symbols.length) remaining = 0;
  }
  return out;
}

// Runs `job` over `items`, `width` at a time.
export async function pool(items, width, job) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await job(item);
    }
  }
  await Promise.all(Array.from({ length: width }, worker));
}

function twoLetters() {
  const out = [];
  for (const a of LETTERS) for (const b of LETTERS) out.push(a + b);
  return out;
}

function isDire(name) {
  return /\bDIRE\b/i.test(name) || /dana investasi real estat/i.test(name);
}

export async function idxListings() {
  const found = new Map();
  const take = (symbol, searchType) => {
    if (symbol.exchange !== "IDX") return;
    const type = kindOf(symbol);
    if (searchType === "stocks" && type !== "STOCK") return;
    if (searchType === "funds" && type !== "ETF") return;
    const ticker = normalize(symbol.symbol).toUpperCase();
    const name = normalize(symbol.description);
    if (!ticker || !name) throw new Error("an IDX line has no ticker or name");
    if (type === "STOCK" && isDire(name)) return;
    const isin = isinOf(symbol.isin);
    const currency = normalize(symbol.currency_code).toUpperCase();
    if (!isin) throw new Error(`${ticker} has no ISIN`);
    if (currency !== "IDR") throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
    const prior = found.get(ticker);
    if (prior && (prior.isin !== isin || prior.type !== type)) {
      throw new Error(`${ticker} is both ${prior.isin} ${prior.type} and ${isin} ${type}`);
    }
    if (!prior) found.set(ticker, { ticker, name, isin, type });
  };
  const texts = ["R-", ...twoLetters()];
  for (const searchType of ["stocks", "funds"]) {
    await pool(texts, 8, async (text) => {
      for (const symbol of await searchAll(text, "IDX", searchType)) take(symbol, searchType);
    });
  }
  const rows = [...found.values()].sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
  const shares = rows.filter((row) => row.type === "STOCK").length;
  const funds = rows.filter((row) => row.type === "ETF").length;
  if (shares < 900) throw new Error(`only ${shares} IDX shares`);
  if (funds < 40) throw new Error(`only ${funds} IDX ETFs`);
  for (const ticker of ["BBCA", "TLKM", "GOTO", "XRDN", "XIIT", "R-LQ45X"]) {
    if (!found.has(ticker)) throw new Error(`missing ${ticker}`);
  }
  return rows.map((row) => ({
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: "IDX",
    mic: "XIDX",
    currency: "IDR",
    type: row.type,
    isin: row.isin,
    raw: [row.ticker, row.name, "IDX", row.isin, row.type].join(" "),
  }));
}
