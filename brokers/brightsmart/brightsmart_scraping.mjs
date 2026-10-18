// What Bright Smart (耀才) sells as shares and ETFs, with no login. The
// securities menu lists eleven markets: Hong Kong, Shanghai and Shenzhen
// A shares through Stock Connect, Shanghai and Shenzhen B shares, the US,
// Taiwan, Singapore, Japan, Australia and the UK. The commission pages
// (Hong Kong, Stock Connect, global securities) price the same markets,
// electronic and phone, and name no other.
//
// The public product search (環球股票搜尋) takes a market and a name. An
// empty name returns the whole market with a record count (a keyword
// search, e.g. "A" on US, returns a subset of it), so each market is read
// in one post and the table must hold that many rows. The table is the
// code, a name, the board lot and the currency, nothing more.
//
// That table is a security master, not a quote board. It keeps delisted
// lines, old aliases (BRK A, BRK.A, BRK/A), warrants, CBBCs, rights,
// unlisted and OTC names. So each market is matched against a current
// list of that exchange, and only shares, preferred shares, REITs and
// exchange-traded funds or notes on both lists are kept:
//
// - Hong Kong: HKEX's List of Securities. Equity, Exchange Traded Products
//   and REITs stay, with HKEX's ISIN. Debt, derivative warrants, CBBCs,
//   inline and equity warrants go.
// - Shanghai and Shenzhen A: HKEX's Northbound buy-and-sell lists. A line
//   the search still carries but Stock Connect only lets clients sell is
//   left out. TRST lines are ETFs.
// - Taiwan: the TWSE ISIN pages for TWSE and TPEx (股票, 創新板, 特別股,
//   TDR, REIT, ETF, ETN). Warrants and asset-backed lines go. ISIN from
//   those pages.
// - Japan: the JPX month-end list. PRO Market is for professional
//   investors and stays out. ETF・ETN is ETF, or ETN when the name says so.
//   The REIT and infrastructure fund section stays, as shares.
// - US, UK, Australia, Singapore and the B shares: ../../assets/stocks.csv
//   and etfs.csv on NASDAQ, NYSE, AMEX, CBOE / LSE / ASX / SGX / SSE, SZSE.
//   A US code is read as the list writes it (BRK B -> BRK.B, JPM-D ->
//   JPM/PD); "+" warrants, units, .CL/.CON/.OLD/.NEW aliases, OTC and
//   unlisted lines find no listed match and drop. US AMEX in those lists
//   is NYSE American and Arca together, so that row has no MIC. A live
//   name those lists lack drops with the dead ones.
//
// ISIN: HKEX and TWSE print it; elsewhere a single match on that place in
// the asset lists, several stay on `matches`.
//
// The search lags new listings on some markets (most Tokyo codes after
// 325A, Virgin Australia, Dyno Nobel's new code are not in it). Nothing is
// added from the exchange side: this file is what the search lists.
//
//   https://bss1.bsgroup.com.hk/bsmart.web/SearchProduct.aspx
//   https://www.bsgroup.com.hk/commissions/globalsecurities/
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities
//   https://isin.twse.com.tw/isin/C_public.jsp?strMode=2
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/brightsmart/brightsmart_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const SEARCH = "https://bss1.bsgroup.com.hk/bsmart.web/SearchProduct.aspx";
const HKEX_LIST = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx";
const CONNECT = "https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls";
const TWSE_ISIN = "https://isin.twse.com.tw/isin/C_public.jsp?strMode=";
const JPX_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Search market -> rows the search must return, and rows kept at the end.
const MARKETS = {
  HKEX: { read: 12000, kept: 2800 },
  "SH-A": { read: 1500, kept: 1500 },
  "SZ-A": { read: 1800, kept: 1700 },
  "SH-B": { read: 30, kept: 30 },
  "SZ-B": { read: 30, kept: 30 },
  TW: { read: 4000, kept: 1900 },
  JPN: { read: 4000, kept: 3500 },
  AUS: { read: 4000, kept: 1600 },
  UK: { read: 3000, kept: 1500 },
  SGX: { read: 600, kept: 500 },
  US: { read: 50000, kept: 10000 },
};

const US_PLACE = { NASDAQ: ["NASDAQ", "XNAS"], NYSE: ["NYSE", "XNYS"], AMEX: ["AMEX", ""], CBOE: ["Cboe BZX", "BATS"] };
const LIST_PLACE = {
  "SH-B": { places: ["SSE"], exchange: "SSE", mic: "XSHG" },
  "SZ-B": { places: ["SZSE"], exchange: "SZSE", mic: "XSHE" },
  AUS: { places: ["ASX"], exchange: "ASX", mic: "XASX" },
  UK: { places: ["LSE"], exchange: "LSE", mic: "XLON" },
  SGX: { places: ["SGX"], exchange: "SGX", mic: "XSES" },
};

const XLSX_TO_JSON = `
import json, sys, zipfile, xml.etree.ElementTree as ET
from io import BytesIO
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
book = zipfile.ZipFile(BytesIO(sys.stdin.buffer.read()))
shared = []
if "xl/sharedStrings.xml" in book.namelist():
    for item in ET.fromstring(book.read("xl/sharedStrings.xml")).findall(M + "si"):
        shared.append("".join(node.text or "" for node in item.iter(M + "t")))
def col(ref):
    n = 0
    for ch in ref:
        if not ch.isalpha():
            break
        n = n * 26 + ord(ch) - 64
    return n - 1
rows = []
for row in ET.fromstring(book.read("xl/worksheets/sheet1.xml")).iter(M + "row"):
    values = {}
    for cell in row.findall(M + "c"):
        node = cell.find(M + "v")
        text = "" if node is None or node.text is None else node.text
        if cell.get("t") == "s" and text:
            text = shared[int(text)]
        elif cell.get("t") == "inlineStr":
            text = "".join(t.text or "" for t in cell.iter(M + "t"))
        values[col(cell.get("r") or "A")] = text
    if values:
        rows.append([values.get(i, "") for i in range(max(values) + 1)])
json.dump(rows, sys.stdout, ensure_ascii=False)
`;

// The Stock Connect lists are old-style .xls; xlrd reads them.
const XLS_TO_JSON = `
import json, sys, xlrd
book = xlrd.open_workbook(file_contents=sys.stdin.buffer.read())
sheet = book.sheet_by_index(0)
json.dump([sheet.row_values(i) for i in range(sheet.nrows)], sys.stdout, ensure_ascii=False)
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decode(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

async function request(url, options = {}, as = "text") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, ...(options.headers || {}) },
        signal: AbortSignal.timeout(180_000),
      });
      if (response.ok) return as === "bytes" ? Buffer.from(await response.arrayBuffer()) : response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1500 * 2 ** attempt);
  }
  throw new Error(last);
}

function python(script, bytes, what) {
  const run = spawnSync("python3", ["-c", script], { input: bytes, maxBuffer: 256_000_000 });
  if (run.status !== 0) throw new Error(`${what}: ${run.stderr.toString() || "python3 failed"}`);
  return JSON.parse(run.stdout.toString());
}

// ---- Bright Smart product search -------------------------------------

async function searchMarket(market) {
  const first = await fetch(SEARCH, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!first.ok) throw new Error(`search page answered ${first.status}`);
  const cookie = first.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  const page = await first.text();
  const form = new URLSearchParams();
  for (const match of page.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g)) {
    form.set(match[1], decode(match[2]));
  }
  if (!form.has("__VIEWSTATE")) throw new Error("search page has no __VIEWSTATE");
  form.set("txtExchange", market);
  form.set("txtName", "");
  form.set("btnFind.x", "10");
  form.set("btnFind.y", "10");
  const html = await request(SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: SEARCH, ...(cookie ? { Cookie: cookie } : {}) },
    body: form.toString(),
  });
  const announced = Number(html.match(/找到\s*(\d+)\s*筆記錄/)?.[1]);
  const rows = [];
  const grid = html.slice(html.indexOf('id="gridResult"'));
  for (const match of grid.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...match[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => clean(decode(cell[1])));
    if (cells.length !== 5) continue;
    const [place, code, name, lot, currency] = cells;
    if (place !== market) throw new Error(`${market}: a row filed under ${place}`);
    rows.push({ code, name, lot, currency });
  }
  if (!Number.isInteger(announced)) throw new Error(`${market}: no record count`);
  if (rows.length !== announced) throw new Error(`${market}: ${announced} announced, ${rows.length} rows read`);
  if (rows.length < MARKETS[market].read) throw new Error(`${market}: only ${rows.length} rows`);
  return rows;
}

// ---- Exchange-side lists ---------------------------------------------

async function hkexList() {
  const grid = python(XLSX_TO_JSON, await request(HKEX_LIST, {}, "bytes"), "HKEX list");
  const at = grid.findIndex((row) => row[0] === "Stock Code");
  if (at < 0 || grid[at][2] !== "Category" || grid[at][5] !== "ISIN") throw new Error("HKEX list header moved");
  const list = new Map();
  for (const row of grid.slice(at + 1)) {
    const code = clean(row[0]);
    if (code) list.set(code, { category: clean(row[2]), sub: clean(row[3]), isin: clean(row[5]) });
  }
  if (list.size < 10000) throw new Error(`HKEX list has ${list.size} lines`);
  return list;
}

async function connectList(file) {
  const grid = python(XLS_TO_JSON, await request(`${CONNECT}/${file}.xls`, {}, "bytes"), `${file}.xls (needs python3 xlrd)`);
  const at = grid.findIndex((row) => String(row[0]).trim() === "No.");
  if (at < 0 || !/Stock Code/.test(grid[at][1]) || grid[at][5] !== "Instrument Type") throw new Error(`${file} header moved`);
  const list = new Map();
  for (const row of grid.slice(at + 1)) {
    if (row[1] === "" || row[1] == null) continue;
    list.set(String(Math.round(Number(row[1]))).padStart(6, "0"), clean(row[5]));
  }
  if (list.size < 900) throw new Error(`${file} has ${list.size} lines`);
  return list;
}

const TW_KEEP = {
  股票: "STOCK",
  創新板: "STOCK",
  特別股: "STOCK",
  "臺灣存託憑證(TDR)": "STOCK",
  "受益證券-不動產投資信託": "STOCK",
  ETF: "ETF",
  ETN: "ETN",
};

async function twList() {
  const list = new Map();
  for (const [mode, exchange, mic] of [["2", "TWSE", "XTAI"], ["4", "TPEx", "ROCO"]]) {
    const html = new TextDecoder("big5").decode(await request(`${TWSE_ISIN}${mode}`, {}, "bytes"));
    let section = "";
    let count = 0;
    for (const row of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => clean(decode(cell[1].replace(/<[^>]+>/g, ""))));
      if (cells.length === 1) { section = cells[0]; continue; }
      if (cells.length < 6 || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(cells[1])) continue;
      const type = TW_KEEP[section];
      if (!type) continue;
      const code = cells[0].split(/[\s　]/)[0];
      list.set(code, { exchange, mic, type, isin: cells[1] });
      count += 1;
    }
    if (count < 500) throw new Error(`TWSE ISIN page ${mode} gave ${count} lines`);
  }
  return list;
}

const JP_SECTION = {
  "プライム（内国株式）": "STOCK",
  "スタンダード（内国株式）": "STOCK",
  "グロース（内国株式）": "STOCK",
  "プライム（外国株式）": "STOCK",
  "スタンダード（外国株式）": "STOCK",
  "グロース（外国株式）": "STOCK",
  出資証券: "STOCK",
  "REIT・ベンチャーファンド・カントリーファンド・インフラファンド": "STOCK",
  "ETF・ETN": "ETF",
  "PRO Market": "",
};

async function jpxList() {
  const page = await request(JPX_PAGE);
  const link = page.match(/href="([^"]*data_j\.xlsx?)"/)?.[1];
  if (!link) throw new Error("JPX page did not link data_j.xlsx");
  const grid = python(XLSX_TO_JSON, await request(new URL(link, JPX_PAGE).href, {}, "bytes"), "JPX list");
  if (grid[0]?.[1] !== "コード" || grid[0]?.[3] !== "市場・商品区分") throw new Error("JPX header moved");
  const list = new Map();
  const unknown = new Set();
  for (const row of grid.slice(1)) {
    const code = clean(row[1]).replace(/\.0$/, "");
    const section = clean(row[3]);
    if (!(section in JP_SECTION)) { unknown.add(section); continue; }
    list.set(code, { section, type: JP_SECTION[section], name: clean(row[2]) });
  }
  if (unknown.size) throw new Error(`JPX section not classified: ${[...unknown].join(", ")}`);
  if (list.size < 4000) throw new Error(`JPX list has ${list.size} lines`);
  return list;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// code -> place -> { isins, type, name }
function assetLists() {
  const places = new Set(["SSE", "SZSE", "TSE", "ASX", "LSE", "SGX", ...Object.keys(US_PLACE)]);
  const index = new Map();
  for (const [file, type] of [[STOCKS, "STOCK"], [ETFS, "ETF"]]) {
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    if (table[0]?.slice(0, 3).join(",") !== "ticker,exchange,isin") throw new Error(`${file.pathname} header ${table[0]}`);
    for (const [ticker, place, isin, name] of table.slice(1)) {
      if (!places.has(place)) continue;
      const code = ticker.split(":").pop().toUpperCase();
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(place)) book.set(place, { isins: new Set(), type, name });
      if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) book.get(place).isins.add(isin);
    }
  }
  return index;
}

// Bright Smart's US spellings, as the lists write them. Returns "" for a
// line that is not a share or fund (warrant, unit, old alias).
function usCode(raw) {
  const code = raw.toUpperCase().trim();
  if (/[+*%:]/.test(code)) return "";
  if (/\.(CL|CON|OLD|NEW|UN|U|WS|WT|RT|WI|EXE|REC)\d*$/.test(code)) return "";
  let match = code.match(/^([A-Z]+)[ ./]([A-Z])$/);
  if (match) return `${match[1]}.${match[2]}`;
  match = code.match(/^([A-Z]+) PR([A-Z]?)$/) || code.match(/^([A-Z]+)-([A-Z])$/);
  if (match) return `${match[1]}/P${match[2]}`;
  return /^[A-Z][A-Z0-9]*$/.test(code) ? code : "";
}

// ---- Rows ------------------------------------------------------------

function makeRow({ ticker, name, exchange, mic, currency, type, isin, raw }) {
  const row = { query: isin || ticker, ticker, name: name || ticker, exchange };
  if (mic) row.mic = mic;
  row.currency = currency;
  row.type = type;
  row.isin = isin || "";
  row.raw = raw;
  return row;
}

function fromLists(found, ticker, line, exchange, mic, tally) {
  const groups = new Map();
  for (const [place, entry] of found) if (entry.isins.size) groups.set(place, entry.isins);
  const isins = new Set([...groups.values()].flatMap((set) => [...set]));
  const type = [...found.values()][0].type;
  const row = makeRow({
    ticker,
    name: line.name,
    exchange,
    mic,
    currency: line.currency,
    type,
    isin: isins.size === 1 ? [...isins][0] : "",
    raw: [line.code, line.name, line.lot, line.currency].join(" "),
  });
  if (isins.size === 1) tally.one += 1;
  else if (isins.size > 1) { stampIsinMatches(row, groups, ticker); tally.several += 1; }
  else tally.none += 1;
  return row;
}

const [hkex, sse, szse, tw, jpx] = await Promise.all([
  hkexList(),
  connectList("SSE_Securities"),
  connectList("SZSE_Securities"),
  twList(),
  jpxList(),
]);
const lists = assetLists();

const rows = [];
const read = {};
const dropped = {};
const drop = (market, why) => { const key = `${market} ${why}`; dropped[key] = (dropped[key] || 0) + 1; };
const tally = { one: 0, several: 0, none: 0, printed: 0 };

for (const market of Object.keys(MARKETS)) {
  const lines = await searchMarket(market);
  read[market] = lines.length;
  console.error(`${market}: ${lines.length} lines in the search`);
  for (const line of lines) {
    const code = line.code.toUpperCase();
    if (market === "HKEX") {
      const entry = hkex.get(code);
      if (!entry) { drop(market, "not on the HKEX list"); continue; }
      const type = entry.category === "Exchange Traded Products" ? "ETF"
        : entry.category === "Equity" || entry.category === "Real Estate Investment Trusts" ? "STOCK" : "";
      if (!type) { drop(market, entry.category); continue; }
      tally.printed += 1;
      rows.push(makeRow({ ticker: code, name: line.name, exchange: "HKEX", mic: "XHKG", currency: line.currency, type, isin: entry.isin, raw: [code, line.name, line.lot, line.currency, entry.category].join(" ") }));
    } else if (market === "SH-A" || market === "SZ-A") {
      const kind = (market === "SH-A" ? sse : szse).get(code);
      if (!kind) { drop(market, "not on the Northbound buy-and-sell list"); continue; }
      const place = market === "SH-A" ? "SSE" : "SZSE";
      const found = new Map();
      const book = lists.get(code)?.get(place);
      if (book) found.set(place, book);
      const row = found.size
        ? fromLists(found, code, line, place, market === "SH-A" ? "XSHG" : "XSHE", tally)
        : (tally.none += 1, makeRow({ ticker: code, name: line.name, exchange: place, mic: market === "SH-A" ? "XSHG" : "XSHE", currency: "CNY", type: "", isin: "", raw: [code, line.name, line.lot, line.currency].join(" ") }));
      row.type = kind === "TRST" ? "ETF" : "STOCK";
      row.raw = `${row.raw} ${kind}`;
      rows.push(row);
    } else if (market === "TW") {
      const entry = tw.get(code);
      if (!entry) { drop(market, "not a TWSE/TPEx share, ETF or ETN"); continue; }
      tally.printed += 1;
      rows.push(makeRow({ ticker: code, name: line.name, exchange: entry.exchange, mic: entry.mic, currency: "TWD", type: entry.type, isin: entry.isin, raw: [code, line.name, line.lot, line.currency].join(" ") }));
    } else if (market === "JPN") {
      const entry = jpx.get(code);
      if (!entry) { drop(market, "not on the JPX list"); continue; }
      if (!entry.type) { drop(market, entry.section); continue; }
      const type = entry.type === "ETF" && /ETN|ＥＴＮ/.test(`${entry.name} ${line.name}`) ? "ETN" : entry.type;
      const found = new Map();
      const book = lists.get(code)?.get("TSE");
      if (book) found.set("TSE", book);
      const row = found.size
        ? fromLists(found, code, line, "Tokyo", "XTKS", tally)
        : (tally.none += 1, makeRow({ ticker: code, name: line.name, exchange: "Tokyo", mic: "XTKS", currency: "JPY", type, isin: "", raw: [code, line.name, line.lot, line.currency].join(" ") }));
      row.type = type;
      rows.push(row);
    } else if (market === "US") {
      const ticker = usCode(code);
      if (!ticker) { drop(market, "warrant, unit or old alias"); continue; }
      if (/\bwarrants?\b|\bc\/wts\b|\brights?\b/i.test(line.name)) { drop(market, "warrant or right"); continue; }
      const found = new Map();
      for (const place of Object.keys(US_PLACE)) {
        const book = lists.get(ticker)?.get(place);
        if (book) found.set(place, book);
      }
      if (!found.size) { drop(market, "no listed US match (OTC, unlisted or delisted)"); continue; }
      const place = ["NASDAQ", "NYSE", "CBOE", "AMEX"].find((p) => found.has(p));
      for (const other of [...found.keys()]) if (other !== place) found.delete(other);
      const [exchange, mic] = US_PLACE[place];
      rows.push(fromLists(found, ticker, line, exchange, mic, tally));
    } else {
      const spec = LIST_PLACE[market];
      if (market.endsWith("-B") && !/^(900|200)\d{3}$/.test(code)) { drop(market, "not a B-share code"); continue; }
      if (/\./.test(code) && market === "AUS") { drop(market, "right, option or old code"); continue; }
      if (/\.(OLD|NEW)$/.test(code)) { drop(market, "old or new alias"); continue; }
      const found = new Map();
      for (const place of spec.places) {
        const book = lists.get(code)?.get(place);
        if (book) found.set(place, book);
      }
      if (!found.size) { drop(market, `no current ${spec.places.join("/")} match`); continue; }
      rows.push(fromLists(found, code, line, spec.exchange, spec.mic, tally));
    }
  }
}

const unique = new Map();
for (const row of rows) {
  const key = `${row.exchange}|${row.ticker}`;
  if (!unique.has(key)) unique.set(key, row);
}
const sorted = [...unique.values()].sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));

const kept = {};
const byMarket = { HKEX: ["HKEX"], "SH-A": [], "SZ-A": [], "SH-B": [], "SZ-B": [], TW: ["TWSE", "TPEx"], JPN: ["Tokyo"], AUS: ["ASX"], UK: ["LSE"], SGX: ["SGX"], US: ["NASDAQ", "NYSE", "AMEX", "Cboe BZX"] };
for (const row of sorted) {
  const market = row.exchange === "SSE" ? (/^900/.test(row.ticker) ? "SH-B" : "SH-A")
    : row.exchange === "SZSE" ? (/^200/.test(row.ticker) ? "SZ-B" : "SZ-A")
      : Object.keys(byMarket).find((m) => byMarket[m].includes(row.exchange));
  kept[market] = (kept[market] || 0) + 1;
}
for (const [market, floor] of Object.entries(MARKETS)) {
  if ((kept[market] || 0) < floor.kept) throw new Error(`${market}: only ${kept[market] || 0} lines kept`);
}

fs.writeFileSync(new URL("brightsmart-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(sorted)), null, 2));

const counts = {};
for (const row of sorted) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
const withIsin = sorted.filter((row) => row.isin).length;
console.error(`${sorted.length} rows, ${withIsin} with an ISIN. Read ${JSON.stringify(read)}. Kept ${JSON.stringify(kept)}.`);
console.error("dropped", dropped);
