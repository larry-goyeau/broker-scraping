// AB Capital sells online every non-suspended stock listed on the
// Philippine Stock Exchange. There is no AB Capital list. The link in
// the answer is the PSE directory. The PSE stock page names each line
// and says whether it is Open or Suspended. A suspended line stays out.
// TradingView supplies the description, the currency and the ETF mark.
//
// The published sentence says stock, not ETF. The user asked for the
// exchange's ETF as well, so FMETF is kept.
// A warrant and a right stay out. A pre-IPO stays out. A bond stays out.
// The foreigner table names a few codes a non-Filipino cannot buy. Those
// lines stay: a Filipino can.
//
//   https://securities.abcapitalonline.com/frequently-asked-questions/
//   https://www.pse.com.ph/stockMarket/listedCompanyDirectory.html
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=SM&exchange=PSE&lang=en&domain=production&search_type=stocks
//
//   node brokers/abcapital/abcapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const DIRECTORY = "https://edge.pse.com.ph/companyDirectory/search.ax";
const STOCK = "https://edge.pse.com.ph/companyPage/stockData.do";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EQUITY = new Set(["common", "preferred", "philippine deposit receipts"]);
const CASH = new Set(["PHP", "USD"]);

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

const quotes = await tradingView();
const companies = await directoryIds();
console.error(`${companies.length} companies, ${quotes.size} TradingView lines`);
const books = (await pool(companies, 6, companySecurities)).flat();

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

for (const ticker of ["SM", "ALI", "BDO", "FMETF", "SMC2L"]) {
  if (!listed.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}
const fmetf = listed.find((row) => row.ticker === "FMETF");
if (fmetf.type !== "ETF") throw new Error(`FMETF is typed ${fmetf.type}`);
if (listed.some((row) => row.ticker === "AAA")) throw new Error("AAA is suspended and was kept");
const shares = listed.filter((row) => row.type === "STOCK").length;
const etfs = listed.filter((row) => row.type === "ETF").length;
if (shares < 200) throw new Error(`only ${shares} shares`);
if (etfs < 1) throw new Error(`only ${etfs} ETFs`);
if (leftOut.length) console.error(`${leftOut.length} lines left out: ${leftOut.sort().join(", ")}`);
if (leftOut.length > 40) throw new Error(`${leftOut.length} lines were left out`);

const kept = stampRows(withoutObligations(listed));
fs.writeFileSync(new URL("abcapital-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${shares} STOCK, ${etfs} ETF)`
);
console.error(`${suspended.length} suspended left out`);
if (kept.length < listed.length) console.error(`${listed.length - kept.length} bonds left out`);
