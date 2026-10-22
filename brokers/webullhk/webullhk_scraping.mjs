// What Webull Securities Limited (Webull Hong Kong, webull.hk, SFC CE No.
// BNG700) sells as shares and funds to its clients. Four markets:
//
// - US: Webull's frozen US rows (../webull/webull-base.json, read from
//   Webull Singapore's OpenAPI) on NYSE, Nasdaq, NYSE Arca / American (AMEX)
//   and Cboe BZX. OTC and crypto lines go.
//     "Currently, only US-listed stocks and ETFs are supported."
//     "US Market (NYSE, Nasdaq) ... USD: Equities, ETFs" (HKD and CNY: N/A)
//     https://www.webull.hk/en/hc/categories/fq1110-Frequently-Asked-Questions-about-trading-in-U-S-Market
//   Webull HK's own US primer names NYSE, Nasdaq and AMEX as the three
//   exchanges, so the AMEX rows stay; Cboe BZX lines are US-listed ETFs.
//     https://www.webull.hk/en/help/faq/1998
//   ETNs stay: Webull's own shelf files them as ETFs (sub_category ETF), the
//   base only relabels them by name.
//   Penny stocks: "Most penny stocks are not available for trading here."
//   The only number the page gives is its table: a buy order entered below
//   US$0.01 is refused ("p < $0.01 ... N"); from $0.01 up the rule is a
//   minimum quantity, not a ban. So only titles the public screener prices
//   below $0.01 go. "Most" has no list behind it and is not applied.
//     https://www.webull.hk/en/help/faq/1283
//
// - Hong Kong: the base HKEX rows (stocks and ETFs), plus HKEX's REITs. The
//   base has no REIT (the OpenAPI shelf files them under a sub-category the
//   old scraper did not keep), so they come from HKEX's List of Securities.
//     "HK Market (SEHK) | HKD: Equities, ETFs, REITs, listed derivatives
//     ... | CNY: Equities, ETFs, REITS, etc. | USD: N/A"   (fq1110 above)
//   So HKEX lines are kept in HKD and RMB (CNH) and the USD lines go. The
//   base carried each HKD title also in USD/CNH when the market quotes it
//   so; a line Webull itself listed in a currency (its `raw` says so) wins
//   over a copy, and one (ISIN, currency) gives one row.
//     https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//
// - China Connect: the base Shanghai / Shenzhen rows (CNH). STAR (688/689)
//   and ChiNext (300/301) are out:
//     "ChiNext and STAR stocks are limited to institutional professional
//     investors."
//     https://www.webull.hk/en/help/faq/1357-List-of-eligible-stocks-for-Northbound-Trading
//
// - Japan (Tokyo): webull.hk has a "Trading in JP market" help section and
//   a JP market fee line "JP Stocks & ETFs ... Applicable to Japan Equities
//   Securities, ETFs, etc." (https://www.webull.hk/en/pricing,
//   https://www.webull.hk/en/jp-stocks, https://www.webull.hk/en/help/faq/1851).
//   The public screener returns nothing for Japan, so the list is JPX's
//   month-end listed-issues file: Prime, Standard and Growth (domestic and
//   foreign) are STOCK, ETF・ETN is ETF (ETN when the name says so). PRO
//   Market is for professional investors only, the REIT / infrastructure
//   fund section and the Bank of Japan subscription certificates (出資証券)
//   are not named by webull.hk and stay out. ISIN: a single TSE match in
//   ../../assets/stocks.csv / etfs.csv.
//     https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
// Deposit currencies: "Currently, Webull Securities supports the deposit of
// Hong Kong dollars, RMB and U.S. dollars."
//   https://www.webull.hk/en/hc/categories/fq1134-Deposit-Notes
// JPY cannot be deposited: "trading Japanese stocks is only supported after
// ensuring sufficient funds are available through currency exchange."
//   https://www.webull.hk/en/help/faq/1850
// Each line keeps the one currency its place quotes it in; HKEX's dual
// counters are the only multi-currency case (HKD and CNH, see above).
//
//   node brokers/webullhk/webullhk_scraping.mjs

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";

const BASE = new URL("../webull/webull-base.json", import.meta.url);
const OUTPUT = new URL("webullhk-parsed.json", import.meta.url);
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const HKEX_LIST = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx";
const JPX_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";
const SCREENER = "https://quotes-gw.webullfintech.com/api/wlas/screener/ng/query";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WEBULL_HEADERS = {
  app: "hk",
  appid: "wb_web_hk",
  "app-group": "broker",
  platform: "web",
  "device-type": "Web",
  hl: "en",
  os: "web",
  ver: "1.0.0",
  "Content-Type": "application/json",
  "User-Agent": UA,
};

const US_PLACES = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);
const HK_CURRENCIES = new Set(["HKD", "CNH"]);
const FUND_TYPES = new Set(["ETF", "ETN", "ETC"]);

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function request(url, options = {}, as = "text") {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, ...(options.headers || {}) },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      if (as === "bytes") return Buffer.from(await response.arrayBuffer());
      if (as === "json") return response.json();
      return response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
}

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

function xlsxRows(bytes, label) {
  const run = spawnSync("python3", ["-I", "-c", XLSX_TO_JSON], { input: bytes, maxBuffer: 200_000_000 });
  if (run.status !== 0) throw new Error(`${label}: ${run.stderr}`);
  return JSON.parse(run.stdout.toString("utf8"));
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

// ---- US penny stocks -------------------------------------------------------

// Titles Webull HK's screener prices below US$0.01. A band holding more than
// one page is split until each half fits.
async function sub1CentTickers() {
  const found = new Set();
  async function band(low, high, depth = 0) {
    const body = {
      fetch: 500,
      rules: {
        "wlas.screener.rule.region": "securities.region.name.6",
        "wlas.screener.rule.price": `gte=${low}&lte=${high}`,
      },
      sort: { rule: "wlas.screener.rule.price", desc: true },
      attach: { hkexPrivilege: true },
    };
    const answer = await request(SCREENER, { method: "POST", headers: WEBULL_HEADERS, body: JSON.stringify(body) }, "json");
    const items = Array.isArray(answer?.items) ? answer.items : [];
    if ((answer?.total || 0) > items.length) {
      if (depth > 12) throw new Error(`screener band ${low}-${high} will not split`);
      const mid = Number(((low + high) / 2).toFixed(6));
      await band(low, mid, depth + 1);
      await band(Number((mid + 0.000001).toFixed(6)), high, depth + 1);
      return;
    }
    for (const item of items) {
      const ticker = clean(item?.ticker?.disSymbol || item?.ticker?.symbol).toUpperCase().replace(/[\s/-]+/g, ".");
      if (ticker) found.add(ticker);
    }
  }
  await band(0, 0.0099);
  return found;
}

// ---- Hong Kong -------------------------------------------------------------

function rawCurrency(row) {
  return clean(row.raw).split(" ").pop().toUpperCase();
}

// One row per (ISIN, currency, type), Webull's own counter line first. A
// copy that stands for the other counter takes that counter's code from
// HKEX's list (83118 in HKD is 3118).
function hongKongRows(base, counters) {
  const groups = new Map();
  for (const row of base) {
    if (row.exchange !== "HKEX" || !HK_CURRENCIES.has(row.currency)) continue;
    const key = `${row.isin || row.ticker}|${row.currency}|${row.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = [];
  for (const group of groups.values()) {
    const own = group.find((row) => rawCurrency(row) === row.currency);
    if (own) { out.push(own); continue; }
    const row = { ...group[0] };
    const code = counters.get(`${row.ticker}|${row.currency}`);
    if (code) {
      row.query = code;
      row.ticker = code;
    }
    out.push(row);
  }
  return out;
}

// REIT rows, and the dual counters as "code|currency wanted" -> code.
async function hkexList() {
  const grid = xlsxRows(await request(HKEX_LIST, {}, "bytes"), "HKEX list");
  const at = grid.findIndex((row) => row[0] === "Stock Code");
  if (
    at < 0 || grid[at][2] !== "Category" || grid[at][5] !== "ISIN" ||
    grid[at][16] !== "Trading Currency" || grid[at][17] !== "RMB Counter"
  ) {
    throw new Error("HKEX list header moved");
  }
  const counters = new Map();
  const rows = [];
  for (const line of grid.slice(at + 1)) {
    const hkd = clean(line[0]).replace(/^0+/, "");
    const rmb = clean(line[17]).replace(/^0+/, "");
    if (hkd && rmb && clean(line[16]).toUpperCase() === "HKD") {
      counters.set(`${hkd}|CNH`, rmb);
      counters.set(`${rmb}|HKD`, hkd);
    }
    if (clean(line[2]) !== "Real Estate Investment Trusts") continue;
    const code = clean(line[0]).replace(/^0+/, "") || "0";
    const currency = clean(line[16]).toUpperCase() === "RMB" ? "CNH" : clean(line[16]).toUpperCase();
    if (!HK_CURRENCIES.has(currency)) continue;
    const name = clean(line[1]);
    rows.push({
      query: code,
      ticker: code,
      name,
      exchange: "HKEX",
      currency,
      type: "STOCK",
      raw: [clean(line[0]), name, "HKEX", currency].join(" "),
      isin: clean(line[5]),
    });
  }
  if (rows.length < 5) throw new Error(`HKEX list gave ${rows.length} REITs`);
  if (counters.size < 40) throw new Error(`HKEX list gave ${counters.size / 2} dual counters`);
  return { reits: rows, counters };
}

// ---- Japan -----------------------------------------------------------------

const JP_SECTION = {
  "プライム（内国株式）": "STOCK",
  "スタンダード（内国株式）": "STOCK",
  "グロース（内国株式）": "STOCK",
  "プライム（外国株式）": "STOCK",
  "スタンダード（外国株式）": "STOCK",
  "グロース（外国株式）": "STOCK",
  "ETF・ETN": "ETF",
  "PRO Market": "",
  "REIT・ベンチャーファンド・カントリーファンド・インフラファンド": "",
  出資証券: "",
};

function tokyoIsins() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    if (table[0]?.slice(0, 3).join(",") !== "ticker,exchange,isin") throw new Error(`${file.pathname} header ${table[0]}`);
    for (const [ticker, place, isin, name] of table.slice(1)) {
      if (place !== "TSE" || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin || "")) continue;
      const code = ticker.split(":").pop().toUpperCase();
      if (!index.has(code)) index.set(code, new Map());
      index.get(code).set(isin, clean(name));
    }
  }
  return index;
}

async function tokyoRows() {
  const page = await request(JPX_PAGE);
  const link = page.match(/href="([^"]*data_j\.xlsx?)"/)?.[1];
  if (!link) throw new Error("JPX page did not link data_j.xlsx");
  const grid = xlsxRows(await request(new URL(link, JPX_PAGE).href, {}, "bytes"), "JPX list");
  if (grid[0]?.[1] !== "コード" || grid[0]?.[2] !== "銘柄名" || grid[0]?.[3] !== "市場・商品区分") {
    throw new Error("JPX header moved");
  }
  const asOf = clean(grid[1]?.[0]);
  const isins = tokyoIsins();
  const rows = [];
  const unknown = new Set();
  const skipped = new Map();
  for (const line of grid.slice(1)) {
    const code = clean(line[1]).replace(/\.0$/, "").toUpperCase();
    const section = clean(line[3]);
    if (!code || !section) continue;
    if (!(section in JP_SECTION)) { unknown.add(section); continue; }
    let type = JP_SECTION[section];
    if (!type) { skipped.set(section, (skipped.get(section) || 0) + 1); continue; }
    const jpName = clean(String(line[2]).normalize("NFKC"));
    if (type === "ETF" && /ETN/i.test(jpName)) type = "ETN";
    const found = isins.get(code);
    const isin = found?.size === 1 ? [...found.keys()][0] : "";
    const name = (isin && found.get(isin)) || jpName;
    rows.push({
      query: code,
      ticker: code,
      name,
      exchange: "Tokyo",
      mic: "XTKS",
      currency: "JPY",
      type,
      raw: [code, jpName, "Tokyo", "JPY", section].join(" "),
      isin,
    });
  }
  if (unknown.size) throw new Error(`JPX section not classified: ${[...unknown].join(", ")}`);
  if (rows.length < 3500) throw new Error(`JPX list gave ${rows.length} lines`);
  return { rows, asOf, skipped };
}

// ---- Build -----------------------------------------------------------------

const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
const [penny, hkex, tokyo] = await Promise.all([sub1CentTickers(), hkexList(), tokyoRows()]);

const dropped = new Map();
const drop = (reason) => dropped.set(reason, (dropped.get(reason) || 0) + 1);

const us = [];
for (const row of base) {
  if (row.exchange === "OTC") { drop("US OTC"); continue; }
  if (row.type === "CRYPTO") { drop("crypto"); continue; }
  if (!US_PLACES.has(row.exchange)) continue;
  if (row.type !== "STOCK" && !FUND_TYPES.has(row.type)) { drop(`US ${row.type}`); continue; }
  if (penny.has(String(row.ticker).toUpperCase())) { drop("US below $0.01"); continue; }
  us.push(row);
}

for (const row of base) if (row.exchange === "HKEX" && !HK_CURRENCIES.has(row.currency)) drop(`HKEX ${row.currency}`);
const hk = hongKongRows(base, hkex.counters);
const hkKeys = new Set(hk.map((row) => `${row.isin}|${row.currency}`));
let reitsAdded = 0;
for (const row of hkex.reits) {
  if (hkKeys.has(`${row.isin}|${row.currency}`)) continue;
  hkKeys.add(`${row.isin}|${row.currency}`);
  hk.push(row);
  reitsAdded += 1;
}

const connect = [];
for (const row of base) {
  if (row.exchange !== "Shanghai" && row.exchange !== "Shenzhen") continue;
  const restricted =
    (row.exchange === "Shanghai" && /^68[89]/.test(row.ticker)) ||
    (row.exchange === "Shenzhen" && /^30[01]/.test(row.ticker));
  if (restricted) { drop("STAR / ChiNext"); continue; }
  connect.push(row);
}

const rows = [...us, ...hk, ...connect, ...tokyo.rows].map((row) => ({ ...row }));

const unresolved = new Set();
for (const row of rows) {
  const venue = resolveVenue(row).venue;
  if (!venue) unresolved.add(`${row.exchange}|${row.mic || ""}|${row.currency}`);
}
if (unresolved.size) throw new Error(`venues not resolved: ${[...unresolved].join(", ")}`);

rows.sort((left, right) =>
  String(left.type).localeCompare(right.type) ||
  String(left.exchange).localeCompare(right.exchange) ||
  String(left.ticker).localeCompare(right.ticker) ||
  String(left.currency).localeCompare(right.currency)
);

const final = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(final, null, 2));

const tally = new Map();
for (const row of final) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  tally.set(key, (tally.get(key) || 0) + 1);
}
console.error(
  `${final.length} rows -> ${OUTPUT.pathname}\n` +
    [...tally].sort().map(([key, count]) => `  ${key}: ${count}`).join("\n") +
    `\n  HKEX REITs added: ${reitsAdded}; JPX file of ${tokyo.asOf}, ` +
    `${tokyo.rows.filter((row) => row.isin).length}/${tokyo.rows.length} Tokyo lines with ISIN; ` +
    `${penny.size} US titles priced below $0.01 on the screener\n` +
    `  left out: ${[...dropped, ...tokyo.skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}`
);
