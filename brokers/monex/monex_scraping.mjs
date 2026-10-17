// What Monex Securities sells in Tokyo funds and notes, and in American
// cash shares, with no login.
//
// Tokyo ETF and ETN are the handled list. The same code is printed again
// for Nagoya, Fukuoka and Sapporo; those boards are not a second line.
// A name that says ETN is an ETN. Everything else on that list is an ETF,
// including a fund that tracks a REIT index. The page prints no ISIN.
// The code is joined to the lists when the Tokyo column has one ISIN.
// TSE in that file is also Toronto's initials, so the join is the Tokyo
// column itself.
//
// American cash shares and funds are the download on the cash page. The
// page says a sell-only name is not in it. Common stock and an ADR are
// shares. A line the file calls ETF stays an ETF, unless the name says
// ETN. Nasdaq Capital Market is Nasdaq. NYSE Market is NYSE American:
// the file already has a separate ARCA column, and those names are the
// American list. Texas SE is the Texas Stock Exchange, stored as the
// file writes it. The file prints no ISIN.
//
// Domestic ordinary shares are the public name search, walked by the 33
// Tokyo sectors. An empty query returns nothing. The code is then the
// Tokyo, Nagoya, Fukuoka and Sapporo columns of the lists, one line per
// board the lists already have. A code the lists do not have yet takes
// the board from its company page. The search misses a few domestic Tokyo
// names. Those come from the JPX month-end file: Prime, Standard and
// Growth domestic shares, and the 出資証券. A bond-type class share stays
// out, and so do PRO Market, the REIT section and a Tokyo foreign share.
// REIT, venture funds and subscription rights are not in the search.
//
// Hong Kong is the cash rule: Main Board and GEM shares, and listed funds,
// except a suspended line and an ETF or REIT whose manager has not filed
// the foreign-investment-trust notice. The exchange list is the share book.
// A suspension of three months or more is the named list in the monthly
// status report. The filed funds are the Hong Kong ETFs on SBI's handled
// list, which states that an unfiled overseas ETF is not sold, the four
// iShares names on BlackRock's September 2026 filed list, and Link REIT,
// whose manager filed its foreign-trust report on 25 September 2026.
//
//   https://mst.monex.co.jp/mst/servlet/ITS/fi/EtfStockList
//   https://mst.monex.co.jp/mst/servlet/ITS/ucu/UsSymbolListGST
//   https://mst.monex.co.jp/pc/pdfroot/public/50/99/Monex_US_LIST.csv
//   https://scouter.monex.co.jp/find/basicInfo
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://www2.hkexnews.hk/-/media/HKEXnews/Homepage/Exchange-Reports/Prolonged-Suspension-Status-Report/psuspenrep_mb.pdf
//
//   node brokers/monex/monex_scraping.mjs
//   node brokers/monex/monex_scraping.mjs --us=./Monex_US_LIST.csv --etf=./etf.html --tokyo=./data_j.xlsx

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import fs from "node:fs";

const ETF_PATH = "/mst/servlet/ITS/fi/EtfStockList";
const US_PATH = "/pc/pdfroot/public/50/99/Monex_US_LIST.csv";
const SCOUT = "https://scouter.monex.co.jp";
const FIND = `${SCOUT}/find/basicInfo`;
const JPX_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";
const HK_LIST = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx";
const HK_SUSPEND = [
  "https://www2.hkexnews.hk/-/media/HKEXnews/Homepage/Exchange-Reports/Prolonged-Suspension-Status-Report/psuspenrep_mb.pdf",
  "https://www2.hkexnews.hk/-/media/HKEXnews/Homepage/Exchange-Reports/Prolonged-Suspension-Status-Report/psuspenrep_gem.pdf",
];
const HK_SHARE = new Set([
  "Equity Securities (Main Board)",
  "Equity Securities (GEM)",
  "Depositary Receipts",
]);
// Still listed on 20 October 2026. 02833 and 03072 had left the board.
const HK_FILED = new Set([
  "02800", "02801", "02809", "02820", "02822", "02823", "02826", "02827", "02828",
  "02836", "02837", "02838", "02845", "02846", "02848", "03007", "03015", "03020",
  "03033", "03036", "03040", "03087", "03110", "07200", "07226", "07500", "07552",
  "00823",
]);
const TOKYO_STOCK = new Set([
  "プライム（内国株式）",
  "スタンダード（内国株式）",
  "グロース（内国株式）",
  "出資証券",
]);
const HOSTS = ["https://mst.monex.co.jp", "https://mxp1.monex.co.jp"];
const AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "yes-please/2022",
];

const US_EXCHANGE = {
  NASDAQ: "XNAS",
  "NASDAQ CAP": "XNAS",
  "NASDAQ CAPITAL MARKET": "XNAS",
  NYSE: "XNYS",
  ARCA: "ARCX",
  "NYSE AMERICAN": "XASE",
  "NYSE MARKET": "XASE",
  CBOE: "BATS",
  "TEXAS SE": "Texas SE",
};

const US_TYPE = {
  "COMMON STOCK": "STOCK",
  ADR: "STOCK",
  ETF: "ETF",
};

const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const CODE = /^\d{3}[0-9A-Z]$/;
const JP_CODE = /^(?:\d{3}[A-Z]|\d{4}[0-9A-Z]?)$/;
const TICKER = /^[A-Z][A-Z0-9.]{0,14}$/;

function arg(flag) {
  const hit = process.argv.slice(2).find((item) => item.startsWith(`--${flag}=`));
  return hit ? hit.split("=").slice(1).join("=") : "";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeEntities(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function clean(value) {
  return decodeEntities(value).replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

function fold(value) {
  return clean(value).replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

function hasJapanese(value) {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(value);
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
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function decodeBytes(bytes, contentType, fallback) {
  const labeled = /charset=([^;]+)/i.exec(contentType || "");
  let name = (labeled?.[1] || fallback || "utf-8").trim().toLowerCase().replace(/_/g, "-");
  if (name === "windows-31j" || name === "cp932" || name === "ms932") name = "shift_jis";
  return new TextDecoder(name).decode(bytes);
}

function decodeHtml(bytes, contentType) {
  const labeled = /charset=/i.test(contentType || "");
  if (labeled) return decodeBytes(bytes, contentType, "shift_jis");
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("件中") || text.includes("取扱")) return text;
  } catch {
    // Windows-31J is not valid UTF-8.
  }
  return new TextDecoder("shift_jis").decode(bytes);
}

function decodeCsv(bytes) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("年")) return text;
  } catch {
    // The download is Windows-31J.
  }
  return new TextDecoder("shift_jis").decode(bytes);
}

const jar = new Map();

function store(response) {
  const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const line of lines) {
    const pair = line.split(";")[0];
    const cut = pair.indexOf("=");
    if (cut > 0) jar.set(pair.slice(0, cut).trim(), pair.slice(cut + 1).trim());
  }
}

function cookieHeader() {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function fetchBytes(url) {
  let last = "";
  const cookie = cookieHeader();
  for (const agent of AGENTS) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": agent,
          Accept: "*/*",
          "Accept-Language": "ja,en;q=0.8",
          Referer: `${new URL(url).origin}/`,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(40_000),
      });
      store(response);
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        const type = response.headers.get("content-type") || "";
        if (bytes.length < 800 && /access denied/i.test(bytes.toString("latin1"))) {
          last = `403 ${url}`;
          continue;
        }
        return { bytes, type, url: response.url || url };
      }
      last = `${response.status} ${url}`;
      if (response.status !== 403 && response.status !== 429) break;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(300);
  }
  throw new Error(last);
}

function localBytes(file) {
  return { bytes: fs.readFileSync(file), type: "", url: "" };
}

function usRows(text) {
  const rows = [];
  const unread = [];
  for (const cells of parseCsv(text)) {
    if (cells.length < 5) continue;
    const ticker = clean(cells[0]).toUpperCase();
    const english = clean(cells[1]);
    const japanese = clean(cells[2]);
    const printed = clean(cells[3]);
    const kind = clean(cells[4]).toUpperCase();
    if (!TICKER.test(ticker)) {
      unread.push(cells.join(",").slice(0, 120));
      continue;
    }
    const exchange = US_EXCHANGE[printed.toUpperCase()];
    const type = US_TYPE[kind];
    if (!exchange || !type) {
      unread.push(`${ticker} ${printed} ${kind}`);
      continue;
    }
    const name = hasJapanese(japanese) ? japanese : english || ticker;
    const product = type === "ETF" && /\bETN\b/.test(fold(`${english} ${japanese}`)) ? "ETN" : type;
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency: "USD",
      type: product,
      raw: [ticker, english, japanese, printed, product].filter(Boolean).join(" "),
    });
  }
  if (unread.length) throw new Error(`US file has ${unread.length} unread rows, first: ${unread[0]}`);
  if (rows.length < 3000) throw new Error(`the US cash list was short: ${rows.length}`);
  return rows;
}

function rangeOf(html) {
  const match = html.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)\s*件\s*\(\s*(\d[\d,]*)\s*件中\s*\)/);
  if (!match) return null;
  const number = (value) => Number(value.replace(/,/g, ""));
  return { from: number(match[1]), to: number(match[2]), total: number(match[3]) };
}

function linked(html, label, base) {
  const match = html.match(new RegExp(`linkCheckLocal\\('([^']+)'\\)[^>]*>\\s*${label}`));
  if (!match) return "";
  return new URL(match[1].replace(/&amp;/g, "&"), base).href;
}

function nextPage(html, base) {
  const match = html.match(/class="next"[\s\S]*?<a[^>]*href="([^"]+)"/);
  if (!match || /^javascript:/i.test(match[1])) return "";
  return new URL(match[1].replace(/&amp;/g, "&"), base).href;
}

function pageRows(html) {
  const rows = [];
  for (const hit of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cells = [...hit[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    if (cells.length < 3) continue;
    const ticker = clean(cells[0]).toUpperCase();
    if (!CODE.test(ticker)) continue;
    const market = clean((cells[1].match(/[\[［]([^\]］]+)[\]］]/) || [])[1] || "");
    const linkedName = (cells[1].match(/<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1];
    const name = clean(linkedName || cells[1]).replace(/^[\[［][^\]］]+[\]］]\s*/, "");
    if (!market || !name) throw new Error(`unread Tokyo row: ${ticker} ${clean(cells[1])}`);
    rows.push({ ticker, market, name, category: clean(cells[2]) });
  }
  return rows;
}

async function tokyoPages(file) {
  const pages = [];
  if (file) {
    const { bytes, type } = localBytes(file);
    pages.push(decodeHtml(bytes, type));
    return pages;
  }
  let html = "";
  let pageUrl = "";
  let last = "";
  for (const host of HOSTS) {
    try {
      const fetched = await fetchBytes(`${host}${ETF_PATH}`);
      const text = decodeHtml(fetched.bytes, fetched.type);
      if (!text.includes("件中")) {
        last = "the ETF page was not the list";
        continue;
      }
      html = text;
      pageUrl = fetched.url || `${host}${ETF_PATH}`;
      break;
    } catch (error) {
      last = error.message || String(error);
    }
  }
  if (!html) throw new Error(last);
  const wide = linked(html, "100件", pageUrl);
  if (wide) {
    const fetched = await fetchBytes(wide);
    html = decodeHtml(fetched.bytes, fetched.type);
    pageUrl = fetched.url || wide;
  }
  const seen = new Set();
  for (let page = 0; page < 40; page += 1) {
    if (seen.has(pageUrl)) throw new Error("the ETF list repeated a page");
    seen.add(pageUrl);
    pages.push(html);
    const next = nextPage(html, pageUrl);
    if (!next) return pages;
    await sleep(200);
    const fetched = await fetchBytes(next);
    html = decodeHtml(fetched.bytes, fetched.type);
    pageUrl = fetched.url || next;
  }
  throw new Error("the ETF list did not end");
}

function tokyoRows(pages) {
  const found = [];
  let expected = 0;
  for (const html of pages) {
    const range = rangeOf(html);
    if (!range) throw new Error("the ETF page did not say how many names it holds");
    if (!expected) expected = range.total;
    else if (range.total !== expected) throw new Error(`the ETF total changed from ${expected} to ${range.total}`);
    found.push(...pageRows(html));
  }
  if (found.length !== expected) throw new Error(`the ETF list was ${found.length} of ${expected}`);
  const rows = [];
  const seen = new Set();
  for (const row of found) {
    if (row.market !== "東証") continue;
    if (seen.has(row.ticker)) throw new Error(`${row.ticker} is on Tokyo twice`);
    seen.add(row.ticker);
    const type = /\bETN\b/.test(fold(row.name)) ? "ETN" : "ETF";
    rows.push({
      query: row.ticker,
      ticker: row.ticker,
      name: row.name,
      exchange: "Tokyo",
      currency: "JPY",
      type,
      raw: [row.ticker, row.name, "東証", row.category, type].filter(Boolean).join(" "),
    });
  }
  if (rows.length < 300) throw new Error(`the Tokyo ETF list was short: ${rows.length}`);
  return rows;
}

function csvFields(line) {
  const fields = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

// The lists file a Tokyo code under TSE. That initials also means Toronto,
// and a lookup by the initials alone does not pick Tokyo. Nagoya, Fukuoka
// and Sapporo are the other columns of the same code.
const JP_PLACE = {
  Tokyo: ["TSE", "TYO"],
  Nagoya: ["NAG"],
  Fukuoka: ["FSE"],
  Sapporo: ["SAPSE"],
};

function japanIsins() {
  const wanted = new Set(Object.values(JP_PLACE).flat());
  const book = new Map();
  for (const file of [ETFS, STOCKS]) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || /^ticker\s*,/i.test(line)) continue;
      const [symbol, exchange, isin] = csvFields(line);
      const place = clean(exchange).toUpperCase();
      if (!wanted.has(place)) continue;
      const ticker = clean(symbol).split(":").pop().toUpperCase();
      const id = clean(isin).toUpperCase();
      if (!JP_CODE.test(ticker) || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(id)) continue;
      if (!book.has(ticker)) book.set(ticker, new Map());
      const held = book.get(ticker);
      if (!held.has(place)) held.set(place, new Set());
      held.get(place).add(id);
    }
  }
  return book;
}

function attachJapan(rows, book) {
  for (const row of rows) {
    const places = JP_PLACE[row.exchange];
    const held = book.get(row.ticker);
    if (!places || !held) continue;
    const groups = new Map();
    for (const place of places) {
      const ids = held.get(place);
      if (ids?.size) groups.set(place, ids);
    }
    const all = new Set([...groups.values()].flatMap((ids) => [...ids]));
    if (all.size === 1) row.isin = [...all][0];
    else if (all.size > 1) stampIsinMatches(row, groups, row.ticker);
  }
}

async function scoutText(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": AGENTS[0], Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
      if (response.status === 403) {
        await sleep(8_000 * (attempt + 1));
        continue;
      }
    } catch (error) {
      last = `${error.message || error}`;
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
}

function shareCount(html) {
  const match = html.match(/<strong>(\d[\d,]*)<\/strong>\s*件の銘柄/);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

function lastPage(html) {
  const end = html.match(/page=(\d+)" title="最後"/);
  if (end) return Number(end[1]);
  const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((hit) => Number(hit[1]));
  return pages.length ? Math.max(...pages) : 1;
}

function sharesOn(html) {
  const rows = [];
  const seen = new Set();
  for (const hit of html.matchAll(/\/report\/zaimu\/([0-9A-Z]+)"[^>]*title="([^"]*)"/g)) {
    const ticker = hit[1].toUpperCase();
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    if (!CODE.test(ticker)) throw new Error(`unread scout code ${ticker}`);
    const name = clean(hit[2]);
    if (!name) throw new Error(`unread scout name ${ticker}`);
    rows.push({ ticker, name });
  }
  return rows;
}

async function scoutShares() {
  const found = new Map();
  for (let sector = 1; sector <= 33; sector += 1) {
    const term = encodeURIComponent(`@${sector}`);
    const first = await scoutText(`${FIND}?searchTerm=${term}`);
    const expected = shareCount(first);
    const pages = lastPage(first);
    const rows = sharesOn(first);
    for (let page = 2; page <= pages; page += 1) {
      await sleep(200);
      const html = await scoutText(`${FIND}?searchTerm=${term}&page=${page}`);
      rows.push(...sharesOn(html));
    }
    const unique = new Map(rows.map((row) => [row.ticker, row]));
    if (unique.size !== expected) throw new Error(`sector @${sector} was ${unique.size} of ${expected}`);
    for (const row of unique.values()) {
      if (!found.has(row.ticker)) found.set(row.ticker, row);
    }
    console.error(`sector @${sector}: ${expected}`);
  }
  return [...found.values()];
}

function boardOf(label) {
  const text = label.replace(/\s+/g, "");
  if (/PRO|プロ/.test(text)) return "";
  if (text.startsWith("東証")) return "Tokyo";
  if (text.startsWith("名証")) return "Nagoya";
  if (text.startsWith("福証")) return "Fukuoka";
  if (text.startsWith("札証") || text.startsWith("札幌") || text.includes("アンビシャス")) return "Sapporo";
  return null;
}

function boardsFromLists(share, book) {
  const held = book.get(share.ticker);
  if (!held) return [];
  const rows = [];
  if (held.has("TSE") || held.has("TYO")) rows.push({ ...share, exchange: "Tokyo", label: "東証" });
  if (held.has("NAG")) rows.push({ ...share, exchange: "Nagoya", label: "名証" });
  if (held.has("FSE")) rows.push({ ...share, exchange: "Fukuoka", label: "福証" });
  if (held.has("SAPSE")) rows.push({ ...share, exchange: "Sapporo", label: "札証" });
  return rows;
}

const XLSX_TO_JSON = `
import json, sys, zipfile, xml.etree.ElementTree as ET
from io import BytesIO

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
book = zipfile.ZipFile(BytesIO(sys.stdin.buffer.read()))
shared = []
if "xl/sharedStrings.xml" in book.namelist():
    root = ET.fromstring(book.read("xl/sharedStrings.xml"))
    for item in root.findall("m:si", NS):
        shared.append("".join(node.text or "" for node in item.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))
root = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))

def col_index(ref):
    n = 0
    for char in ref:
        if not char.isalpha():
            break
        n = n * 26 + ord(char) - 64
    return n - 1

rows = []
for row in root.findall("m:sheetData/m:row", NS):
    values = {}
    for cell in row.findall("m:c", NS):
        node = cell.find("m:v", NS)
        if node is None or node.text is None:
            value = ""
        elif cell.get("t") == "s":
            value = shared[int(node.text)]
        else:
            value = node.text
        values[col_index(cell.get("r") or "A")] = value
    if not values:
        continue
    width = max(values) + 1
    rows.append([values.get(i, "") for i in range(width)])
json.dump(rows, sys.stdout, ensure_ascii=False)
`;

function workbookRows(bytes) {
  const run = spawnSync("python3", ["-c", XLSX_TO_JSON], { input: bytes, maxBuffer: 32_000_000 });
  if (run.status !== 0) throw new Error(run.stderr.toString() || "the JPX workbook could not be read");
  return JSON.parse(run.stdout.toString());
}

function jpxCode(value) {
  const text = clean(value).replace(/\.0$/, "").toUpperCase();
  return JP_CODE.test(text) ? text : "";
}

// Names the sector search does not return, that the cash rules still sell.
async function tokyoGap(held) {
  const local = arg("tokyo");
  let bytes;
  if (local) bytes = fs.readFileSync(local);
  else {
    const html = await scoutText(JPX_PAGE);
    const link = [...html.matchAll(/href="([^"]*data_j\.xlsx[^"]*)"/gi)]
      .map((hit) => new URL(clean(hit[1]), JPX_PAGE).href)[0];
    if (!link) throw new Error("JPX statistics page did not link data_j.xlsx");
    const response = await fetch(link, {
      headers: { "User-Agent": AGENTS[0] },
      signal: AbortSignal.timeout(40_000),
    });
    if (!response.ok) throw new Error(`${link} answered ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const grid = workbookRows(bytes);
  const header = grid[0]?.map((cell) => clean(cell));
  const codeAt = header?.indexOf("コード");
  const nameAt = header?.indexOf("銘柄名");
  const sectionAt = header?.indexOf("市場・商品区分");
  if (codeAt !== 1 || nameAt !== 2 || sectionAt !== 3) {
    throw new Error(`JPX header is ${(header || []).join(", ")}`);
  }
  const rows = [];
  for (const line of grid.slice(1)) {
    const ticker = jpxCode(line[codeAt]);
    const name = clean(line[nameAt]);
    const section = clean(line[sectionAt]);
    if (!ticker || !TOKYO_STOCK.has(section) || held.has(ticker)) continue;
    if (name.includes("社債型")) continue;
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: "Tokyo",
      currency: "JPY",
      type: "STOCK",
      raw: [ticker, name, section, "STOCK"].join(" "),
    });
  }
  return rows;
}

function suspendCodes(bytes) {
  const latin = Buffer.from(bytes).toString("latin1");
  const parts = [];
  for (const match of latin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let chunk = Buffer.from(match[1], "latin1");
    try {
      chunk = inflateSync(chunk);
    } catch {
      continue;
    }
    const body = chunk.toString("latin1");
    for (const item of body.matchAll(/\[(.*?)\]\s*TJ/gs)) {
      const bits = item[1].match(/\((?:\\\)|[^)])*\)/g) || [];
      parts.push(bits.map((bit) => bit.slice(1, -1)).join(""));
    }
  }
  const codes = new Set();
  const text = parts.join("\n").replace(/\\([()])/g, "$1");
  for (const hit of text.matchAll(/\((\d{1,5})\)/g)) {
    const number = Number(hit[1]);
    if ((number >= 2015 && number <= 2030) || number < 10) continue;
    codes.add(hit[1].padStart(5, "0"));
  }
  return codes;
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": AGENTS[0] },
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function hkTicker(code) {
  const text = String(code || "").trim();
  if (!/^\d+$/.test(text)) return text.toUpperCase();
  return String(Number(text));
}

async function hongKongRows() {
  const suspended = new Set();
  for (const url of HK_SUSPEND) {
    for (const code of suspendCodes(await fetchBuffer(url))) suspended.add(code);
  }
  if (suspended.size < 70) throw new Error(`the suspension list was short: ${suspended.size}`);
  const grid = workbookRows(await fetchBuffer(HK_LIST));
  const header = grid[2]?.map((cell) => clean(cell));
  if (header?.[0] !== "Stock Code" || header?.[5] !== "ISIN" || header?.[16] !== "Trading Currency") {
    throw new Error(`HKEX header is ${(header || []).join(", ")}`);
  }
  const rows = [];
  const currencies = new Set();
  for (const line of grid.slice(3)) {
    const rawCode = clean(line[0]).replace(/\.0$/, "");
    if (!/^\d+$/.test(rawCode)) continue;
    const padded = rawCode.padStart(5, "0");
    if (suspended.has(padded)) continue;
    const name = clean(line[1]);
    const category = clean(line[2]);
    const sub = clean(line[3]);
    const isin = clean(line[5]).toUpperCase();
    const currency = clean(line[16]).toUpperCase().replace("RMB", "CNY");
    const filed = HK_FILED.has(padded);
    let type = "";
    if (category === "Equity" && HK_SHARE.has(sub)) type = "STOCK";
    else if (filed && category === "Real Estate Investment Trusts") type = "REIT";
    else if (filed && category === "Exchange Traded Products") type = "ETF";
    if (!type || !name) continue;
    if (!["HKD", "CNY", "USD"].includes(currency)) currencies.add(currency || "(blank)");
    const ticker = hkTicker(padded);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: "Hong Kong",
      currency: currency || "HKD",
      type,
      raw: [padded, name, sub || category, currency, type].filter(Boolean).join(" "),
      ...( /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? { isin } : {} ),
    });
  }
  if (currencies.size) throw new Error(`unread Hong Kong currency: ${[...currencies].join(", ")}`);
  const stocks = rows.filter((row) => row.type === "STOCK").length;
  const funds = rows.filter((row) => row.type !== "STOCK").length;
  if (stocks < 2000) throw new Error(`the Hong Kong share list was short: ${stocks}`);
  if (funds < 20) throw new Error(`the filed Hong Kong fund list was short: ${funds}`);
  console.error(`Hong Kong: ${stocks} shares, ${funds} filed funds, ${suspended.size} long suspensions left out`);
  return rows;
}

// A code the lists do not have yet still has a board on its company page.
async function boardFromPage(share) {
  const html = await scoutText(`${SCOUT}/report/zaimu/${share.ticker}`);
  const label = clean((html.match(/<td class="market">([^<]*)<\/td>/) || [])[1] || "");
  if (!label) throw new Error(`${share.ticker} has no market`);
  const exchange = boardOf(label);
  if (exchange === null) throw new Error(`${share.ticker} market was ${label}`);
  if (!exchange) return [];
  return [{ ...share, exchange, label }];
}

const usFile = arg("us");
const etfFile = arg("etf");
const usText = usFile
  ? decodeCsv(localBytes(usFile).bytes)
  : decodeCsv((await fetchBytes(`${HOSTS[0]}${US_PATH}`).catch(() => fetchBytes(`${HOSTS[1]}${US_PATH}`))).bytes);
const america = usRows(usText);
const tokyo = tokyoRows(await tokyoPages(etfFile));
const funds = new Set(tokyo.map((row) => row.ticker));
const book = japanIsins();
const named = await scoutShares();
const listed = [];
const missing = [];
for (const share of named) {
  if (funds.has(share.ticker)) continue;
  const rows = boardsFromLists(share, book);
  if (rows.length) listed.push(...rows);
  else missing.push(share);
}
console.error(`domestic shares on the lists: ${listed.length}, company pages left: ${missing.length}`);
for (const share of missing) {
  listed.push(...(await boardFromPage(share)));
  await sleep(250);
}
const shares = listed.map((row) => ({
  query: row.ticker,
  ticker: row.ticker,
  name: row.name,
  exchange: row.exchange,
  currency: "JPY",
  type: "STOCK",
  raw: [row.ticker, row.name, row.label, "STOCK"].join(" "),
}));
const gap = await tokyoGap(new Set([...funds, ...shares.map((row) => row.ticker)]));
console.error(`Tokyo names the search missed: ${gap.length}`);
shares.push(...gap);
attachJapan([...tokyo, ...shares], book);
const hongKong = await hongKongRows();

const seen = new Set();
const unique = [];
for (const row of [...tokyo, ...shares, ...hongKong, ...america]) {
  const key = `${row.exchange}|${row.ticker}`;
  if (seen.has(key)) throw new Error(`${row.ticker} is listed twice on ${row.exchange}`);
  seen.add(key);
  unique.push(row);
}

unique.sort(
  (left, right) =>
    left.exchange.localeCompare(right.exchange) ||
    left.type.localeCompare(right.type) ||
    left.ticker.localeCompare(right.ticker),
);

function expect(ticker, exchange, type) {
  const found = unique.filter((row) => row.ticker === ticker && row.exchange === exchange);
  if (found.length !== 1) throw new Error(`${ticker} on ${exchange} was ${found.length} lines`);
  if (found[0].type !== type) throw new Error(`${ticker} was ${found[0].type}`);
  return found[0];
}

const topix = expect("1306", "Tokyo", "ETF");
if (topix.currency !== "JPY") throw new Error(`TOPIX was ${topix.currency}`);
const note = expect("2040", "Tokyo", "ETN");
const apple = expect("AAPL", "XNAS", "STOCK");
if (apple.currency !== "USD") throw new Error(`Apple was ${apple.currency}`);
const spy = expect("SPY", "ARCX", "ETF");
const brk = expect("BRK.B", "XNYS", "STOCK");
const airi = expect("AIRI", "XASE", "STOCK");
expect("VOO", "ARCX", "ETF");
expect("DDS", "Texas SE", "STOCK");
const toyota = expect("7203", "Tokyo", "STOCK");
if (toyota.currency !== "JPY") throw new Error(`Toyota was ${toyota.currency}`);
expect("1738", "Nagoya", "STOCK");
expect("1771", "Fukuoka", "STOCK");
expect("1449", "Sapporo", "STOCK");
const tencent = expect("700", "Hong Kong", "STOCK");
if (tencent.currency !== "HKD") throw new Error(`Tencent was ${tencent.currency}`);
expect("2801", "Hong Kong", "ETF");
expect("823", "Hong Kong", "REIT");
if (unique.some((row) => row.exchange === "Hong Kong" && (row.ticker === "2804" || row.ticker === "1849"))) {
  throw new Error("an unfiled Hong Kong fund or a long suspension was kept");
}
if (unique.filter((row) => row.exchange === "Hong Kong" && row.type === "STOCK").length < 2000) {
  throw new Error("the Hong Kong share list was short");
}
const boj = expect("8301", "Tokyo", "STOCK");
expect("8421", "Tokyo", "STOCK");
expect("3787", "Tokyo", "STOCK");
if (unique.some((row) => row.ticker === "92015" || row.ticker === "5202" || row.ticker === "8952")) {
  throw new Error("a bond-type share, a delisted name, or a REIT was kept");
}
if (unique.filter((row) => row.type === "STOCK" && row.currency === "JPY").length < 3000) {
  throw new Error("the domestic share list was short");
}
if (unique.filter((row) => row.exchange === "Tokyo" && row.type === "ETF").length < 300) {
  throw new Error("the Tokyo ETF list was short");
}
if (unique.filter((row) => row.exchange === "Tokyo" && row.type === "ETN").length < 15) {
  throw new Error("the Tokyo ETN list was short");
}
if (unique.filter((row) => row.type === "STOCK").length < 3500) throw new Error("the US share list was short");
if (unique.filter((row) => row.exchange !== "Tokyo" && row.type === "ETF").length < 500) {
  throw new Error("the US ETF list was short");
}

const kept = stampRows(withoutObligations(unique));
if (topix.isin !== "JP3027630007") throw new Error(`TOPIX was ${topix.isin || "blank"}`);
if (note.isin !== "JP5528280000") throw new Error(`the Dow note was ${note.isin || "blank"}`);
if (apple.isin !== "US0378331005") throw new Error(`Apple was ${apple.isin || "blank"}`);
if (spy.isin !== "US78462F1030") throw new Error(`SPY was ${spy.isin || "blank"}`);
if (brk.isin !== "US0846707026") throw new Error(`Berkshire was ${brk.isin || "blank"}`);
if (!airi.isin) throw new Error("Air Industries had no ISIN");
if (toyota.isin !== "JP3633400001") throw new Error(`Toyota was ${toyota.isin || "blank"}`);
if (boj.isin !== "JP3699200006") throw new Error(`the Bank of Japan was ${boj.isin || "blank"}`);
if (tencent.isin !== "KYG875721634") throw new Error(`Tencent was ${tencent.isin || "blank"}`);

fs.writeFileSync(new URL("monex-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const tokyoCount = kept.filter((row) => row.exchange === "Tokyo").length;
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings, ${tokyoCount} in Tokyo (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}); ` +
    `${withIsin} with an ISIN`,
);
