// What Charles Schwab lists in shares and exchange-traded funds, with no login.
// The screener page sends the browser to the login screen. The symbol
// selector does not. A query returns at most 25 names, ranked, and says
// which next character still has matches. Walking those characters is the
// whole equity book. Mutual funds are a different book and are not asked for.
//
//   https://typeaheadsearch.schwab.com/marketdata/v2/symbols?query=AAPL&limit=25&type=EQ
//
// The quote page names the board. A name that says ETF, ETN or ETC is that
// type. A line the ETF list already carries on an American tape is an ETF
// too: QQQ's page only says Trust. Everything else is a share. Schwab prints
// a class share with a slash (BRK/B) and a preferred the same way (BAC/PL).
// The lists use a dot for one and a slash for the other, so the form the
// lists already have is the one kept.
//
//   https://www.schwab.wallst.com/Research/Public/stocks/summary/?symbol=AAPL
//
//   node brokers/charlesschwab/charlesschwab_scraping.mjs
//   node brokers/charlesschwab/charlesschwab_scraping.mjs AAPL SPY
//   node brokers/charlesschwab/charlesschwab_scraping.mjs --prefix=Z

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";

const SEARCH = "https://typeaheadsearch.schwab.com/marketdata/v2/symbols";
const QUOTE = "https://www.schwab.wallst.com/Research/Public/stocks/summary/";
const OUTPUT = new URL("charlesschwab-parsed.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const US_MICS = new Set(["XNAS", "ARCX", "XNYS", "XASE", "BATS", "OTCM"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function arg(flag) {
  const hit = process.argv.slice(2).find((item) => item.startsWith(`--${flag}=`));
  return hit ? hit.split("=").slice(1).join("=") : "";
}

function numberArg(flag, fallback) {
  const value = arg(flag);
  return value && /^\d+$/.test(value) ? parseInt(value, 10) : fallback;
}

const lanes = Math.max(1, numberArg("concurrency", 6));
const prefixLimit = arg("prefix").trim();
const only = process.argv.slice(2).filter((item) => !item.startsWith("--")).map((item) => item.trim().toUpperCase()).filter(Boolean);

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function forms(symbol) {
  const text = String(symbol || "").trim().toUpperCase();
  const out = new Set([text]);
  if (text.includes("/")) out.add(text.replaceAll("/", "."));
  if (text.includes(".")) out.add(text.replaceAll(".", "/"));
  if (text.includes("-")) out.add(text.replaceAll("-", "."));
  if (text.includes(".")) out.add(text.replaceAll(".", "-"));
  return [...out];
}

// Tickers the lists already spell, and which of those are funds on an
// American tape. One pass, because both answers are the same two files.
function lists() {
  const known = new Set();
  const funds = new Set();
  for (const [file, fund] of [
    ["../../assets/stocks.csv", false],
    ["../../assets/etfs.csv", true],
  ]) {
    const csvPath = new URL(file, import.meta.url);
    if (!fs.existsSync(csvPath)) continue;
    for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const columns = line.split(",");
      const ticker = String(columns[0] || "").trim().toUpperCase().split(":").pop();
      const place = String(columns[1] || "").trim();
      if (!ticker) continue;
      known.add(ticker);
      if (!fund) continue;
      const { venue } = resolveVenue({ exchange: place });
      if (venue && US_MICS.has(venue.mic)) funds.add(ticker);
    }
  }
  return { known, funds };
}

const { known, funds } = lists();

function catalogueTicker(symbol) {
  for (const form of forms(symbol)) {
    if (known.has(form)) return form;
  }
  return String(symbol || "").trim().toUpperCase();
}

// The quote page names the board and not the currency. American tapes,
// including the OTC sheets, are dollars. The same selector also returns
// a Canadian line Schwab will trade.
const CURRENCY = {
  XNAS: "USD",
  ARCX: "USD",
  XNYS: "USD",
  XASE: "USD",
  BATS: "USD",
  OTCM: "USD",
  XTSE: "CAD",
  XTSX: "CAD",
  XCNQ: "CAD",
  PURE: "CAD",
  XLON: "GBP",
  XHKG: "HKD",
  XASX: "AUD",
  XSWX: "CHF",
  XTKS: "JPY",
  XJPX: "JPY",
  XPAR: "EUR",
  XAMS: "EUR",
  XBRU: "EUR",
  XLIS: "EUR",
  XMIL: "EUR",
  XETR: "EUR",
  XHEL: "EUR",
  XWBO: "EUR",
  XDUB: "EUR",
  XSTO: "SEK",
  XCSE: "DKK",
  XOSL: "NOK",
};

function currencyOf(exchange) {
  const { venue } = resolveVenue({ exchange });
  if (!venue) return "";
  return CURRENCY[venue.mic] || "";
}

function kind(name, ticker) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name) || /exchange-traded fund/i.test(name)) return "ETF";
  if (funds.has(ticker)) return "ETF";
  return "STOCK";
}

async function get(url, headers) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (response.status === 429 || response.status >= 500) {
        last = `${response.status} ${url}`;
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const type = response.headers.get("content-type") || "";
      return type.includes("json") ? response.json() : response.text();
    } catch (error) {
      last = `${error.message || error}`;
      if (attempt === 4) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw new Error(last);
}

async function search(query) {
  const url = `${SEARCH}?query=${encodeURIComponent(query)}&limit=25&type=EQ`;
  const body = await get(url, {
    "User-Agent": UA,
    Accept: "application/json",
    "Schwab-Client-Channel": "IO",
    "Schwab-Client-AppId": "ad00007800",
    "Schwab-Client-CorrelId": "11111111-1111-4111-8111-111111111111",
    Origin: "https://www.schwab.wallst.com",
    Referer: "https://www.schwab.wallst.com/",
  });
  if (!body || !body.meta || !Array.isArray(body.data)) throw new Error(`Schwab selector had no book for ${query}`);
  return body;
}

// A full page of 25 is a ranking, not the book: names that merely resemble
// the query sit in it. A shorter page is every match. The symbol that is
// the query itself (A for Agilent) only appears on that first page.
async function walk(root) {
  const found = new Map();
  const seen = new Set();
  const pending = [];
  const enqueue = (prefix) => {
    const key = String(prefix || "").toUpperCase();
    if (!key || key.length > 16 || seen.has(key)) return;
    seen.add(key);
    pending.push(key);
  };
  enqueue(root);

  let cursor = 0;
  let inflight = 0;
  let calls = 0;

  async function worker() {
    for (;;) {
      if (cursor >= pending.length) {
        if (inflight === 0) return;
        await sleep(15);
        continue;
      }
      const prefix = pending[cursor];
      cursor += 1;
      inflight += 1;
      try {
        const body = await search(prefix);
        calls += 1;
        const rows = body.data.filter((row) => row && row.tradable !== false && (!row.assetType || row.assetType === "EQ"));
        const complete = body.meta.totalResults < 25;
        const next = body.meta.nextCharacters || [];
        for (const row of rows) {
          const symbol = String(row.symbol || "").trim().toUpperCase();
          if (!symbol.startsWith(prefix)) continue;
          if (complete || symbol === prefix) found.set(symbol, row.name || symbol);
        }
        if (!complete) {
          // A space continues a company name, not a ticker. Following it
          // walks the whole name list and never adds a symbol.
          const more = next.filter((character) => /^[A-Z0-9./$&-]$/i.test(character));
          if (!more.length) {
            for (const row of rows) {
              const symbol = String(row.symbol || "").trim().toUpperCase();
              if (symbol.startsWith(prefix)) found.set(symbol, row.name || symbol);
            }
          }
          for (const character of more) enqueue(prefix + character);
        }
        if (calls % 100 === 0) console.error(`${root} ${calls} queries, ${found.size} symbols`);
      } finally {
        inflight -= 1;
      }
    }
  }

  await Promise.all(Array.from({ length: lanes }, () => worker()));
  console.error(`${root}: ${found.size} symbols in ${calls} queries`);
  return found;
}

async function symbols() {
  if (only.length) return new Map(only.map((symbol) => [symbol, ""]));
  const roots = prefixLimit ? [prefixLimit.toUpperCase()] : [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
  const found = new Map();
  for (const root of roots) {
    for (const [symbol, name] of await walk(root)) found.set(symbol, name);
  }
  if (!found.size) throw new Error("Schwab selector was empty");
  return found;
}

async function quote(symbol) {
  const html = await get(`${QUOTE}?symbol=${encodeURIComponent(symbol)}`, {
    "User-Agent": UA,
    Accept: "text/html",
    Referer: "https://www.schwab.com/",
  });
  const match = String(html).match(
    /class="headingLarge">([^<]*?)\s*<strong>([^<]*)<\/strong>:\s*<span class="exchange">([^<]+)<\/span>/
  );
  if (!match) return null;
  const printed = decode(match[2]).toUpperCase();
  return {
    name: decode(match[1]),
    symbol: printed || symbol,
    exchange: decode(match[3]),
  };
}

async function quotes(book) {
  const symbols = [...book.keys()].sort();
  const rows = [];
  let cursor = 0;
  let failed = 0;

  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= symbols.length) return;
      const symbol = symbols[index];
      const page = await quote(symbol);
      if (!page || !page.exchange) {
        failed += 1;
        console.error(`no quote for ${symbol}`);
        continue;
      }
      const ticker = catalogueTicker(page.symbol || symbol);
      const name = page.name || book.get(symbol) || ticker;
      const type = kind(`${name} ${book.get(symbol) || ""}`, ticker);
      const currency = currencyOf(page.exchange);
      if (!currency) console.error(`no currency for ${ticker} on ${page.exchange}`);
      rows.push({
        query: ticker,
        ticker,
        name,
        exchange: page.exchange,
        currency,
        type,
        raw: [ticker, name, page.exchange, currency, type].filter(Boolean).join(" "),
      });
      if (rows.length % 250 === 0) console.error(`${rows.length} quotes`);
    }
  }

  await Promise.all(Array.from({ length: lanes }, () => worker()));
  if (symbols.length > 20 && failed / symbols.length > 0.05) {
    throw new Error(`${failed} of ${symbols.length} symbols had no quote page`);
  }
  if (failed) console.error(`${failed} symbols had no quote page`);
  return rows;
}

const book = await symbols();
console.error(`${book.size} symbols to quote`);
const rows = await quotes(book);
rows.sort((left, right) => left.ticker.localeCompare(right.ticker) || left.exchange.localeCompare(right.exchange));

const full = !only.length && !prefixLimit;
if (full) {
  const apple = rows.find((row) => row.ticker === "AAPL");
  if (!apple || apple.type !== "STOCK" || apple.exchange !== "NASDAQ") throw new Error("Apple was not a Nasdaq share");
  const spy = rows.find((row) => row.ticker === "SPY");
  if (!spy || spy.type !== "ETF" || !/arca/i.test(spy.exchange)) throw new Error("SPY was not an Arca ETF");
  const berkshire = rows.find((row) => row.ticker === "BRK.B");
  if (!berkshire || berkshire.type !== "STOCK" || berkshire.exchange !== "NYSE") throw new Error("Berkshire was not a NYSE share");
  const gld = rows.find((row) => row.ticker === "GLD");
  if (!gld || gld.type !== "ETF") throw new Error("GLD was not an ETF");
  if (rows.filter((row) => row.type === "STOCK").length < 4000) throw new Error("the share book was short");
  if (rows.filter((row) => row.type !== "STOCK").length < 2000) throw new Error("the fund book was short");
}

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings; ${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}; ${withIsin} with an ISIN` +
    (kept.length < rows.length ? `; ${rows.length - kept.length} bonds left out` : "")
);
