// What Moomoo Financial Canada sells: Canadian stocks and ETFs (Toronto,
// TSX Venture and its NEX board, the CSE, Cboe Canada) and US stocks and
// ETFs. The fee schedule prices "Canadian stocks & ETFs" and "US stocks &
// ETFs", the CAD ones in CAD and those "denominated in USD" in USD.
//
//   https://www.moomoo.com/ca/support/topic10_123 (Canada market fees)
//   https://www.moomoo.com/ca/support/topic10_122 (US market fees)
//
// Moomoo CA publishes no list of its own. The entity's site links "CA
// Stocks" and "US Stocks" to the moomoo group's quote site, whose "all CA
// stocks" list is read here from its public JSON endpoint (signed with a
// quote-token header, as in brokers/futuhk). The list is one combined
// Canadian market with no exchange per line, so each code is placed on
// the exchange that lists it, from the exchanges' own lists: the TMX
// company directories (TSX, TSX Venture), the NEX listed-companies page,
// the CSE security list and the Cboe Canada listing directory. A code on
// none of them (a delisted or renamed line the group still carries) stays
// out. A title is written on its listing exchange only: moomoo shows one
// book per line and routes the order itself.
//
// The group's list keeps lines that cannot be traded today, so these stay
// out too: a CSE line whose status on the CSE list is anything but
// "Active" (Suspended, Halted Pending Fundamental Change, Delisted); a
// NEX line whose issuer the NEX page's own data (the issuer data behind
// the page's table, with each issuer's status and instruments) does not
// give as "Active" (Suspended, Halted); and a TSX or TSX Venture line on
// TMX's suspended or delisted company lists for that board. On 21 October
// 2026 that was 112 CSE lines and 81 NEX ones; the TMX lists matched none.
//
//   https://www.moomoo.com/quote/ca/stock-list/all-ca-stocks
//   https://www.moomoo.com/quote-api/quote-v2/get-stock-list?marketType=30&plateType=1&rankType=3&page=0&pageSize=50
//   https://www.tsx.com/json/company-directory/search/tsx/%5E*
//   https://www.tsx.com/json/company-directory/search/tsxv/%5E*
//   https://www.tsx.com/json/company-directory/suspended/tsx (and /tsxv)
//   https://www.tsx.com/json/company-directory/delisted/tsx (and /tsxv)
//   https://www.tsx.com/en/listings/tsx-and-tsxv-issuer-resources/tsx-venture-exchange-issuer-resources/nex/listed-companies
//   https://www.tsx.com/en/resource/571 (TSX & TSXV listed companies: ETP and CDR sectors)
//   https://webapi-backup.thecse.com/trading/listed/market/security_maintenance.json
//   https://www-api.cboe.com/ca/equities/listing-directory-data/
//
// Kept: shares, units, preferred shares, CDRs and ETFs. A TSX line is an
// ETF when TMX files its root ticker under the ETP sector; any other
// sector (closed-end funds and the Mint's gold receipts among them) is a
// share, and so is a CDR, though moomoo types some CDRs as funds. A line
// too new for the monthly sheet keeps moomoo's type. Warrants, rights,
// debentures, notes and receipts stay out. The currency is the line's
// own: a .U line trades in US dollars, and the CSE and Cboe Canada lists
// give each line's currency. Both are deposit currencies (CAD, USD).
//
// The moomoo endpoint blocks an address for five to ten minutes after a
// dozen to two dozen calls ("403 - Operations too frequent"). Calls are
// spaced out, moomoo's second domain (moomooapp.com) is tried when one is
// blocked, and the run waits the block out: on 21 October 2026 the 122
// Canadian pages took four hours and the 238 US pages seven. Two back
// ends answer in turn with different lines, and the order moves with
// prices; marketList below says how the walk copes. Every answer is kept
// in moomooca-list-cache.json, so a stopped run resumes and a rerun within
// three days asks nothing.
//
// The US list is the group's "all US stocks" list, read the same way, and
// each code is placed on the exchange the Nasdaq Trader symbol directory
// names (Nasdaq, the NYSE, NYSE American, NYSE Arca, Cboe BZX, NYSE Texas:
// one NBBO market, one row a title). brokers/futuhk's copy of that list is
// not used: it leaves Cboe BZX out, and with it 1,665 ETFs on 21 October
// 2026 (ARKK among them). A code the directory does not have is an OTC
// line or a delisted one and stays out: moomoo CA's help centre names no
// OTC market (its US pages give Nasdaq's and the exchanges' sessions
// only), unlike moomoo AU and MY. A US line is an ETF when the directory's
// ETF flag says so, or when its name makes it an ETN or a gold, silver,
// bitcoin or currency trust (the directory flags some of these "N"). Any
// other line is a share, though moomoo files it as a fund: a closed-end
// fund or a BDC (GGZ, ADX, OXLC; 347 lines on 21 October 2026) is written
// as a share, as the TSX lines are, and so is a REIT. A code with a halt
// still open in Nasdaq Trader's trade-halts feed (no resumption time) that
// began before today stays out: on 21 October 2026 that was SVA (halted
// since 2019), TJGC (SEC suspension) and ten others; a halt opened today
// is a news or volatility pause and the line is kept.
//
//   https://www.moomoo.com/quote/us/stock-list/all-us-stocks
//   https://www.moomoo.com/quote-api/quote-v2/get-stock-list?marketType=2&plateType=1&rankType=3&page=0&pageSize=50
//   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//   https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts
//
// Every check list is read before the moomoo walk and the run stops if
// one cannot be read or no longer has the shape described here.
//
// The lists carry no ISIN: stampRows fills them from the shared lists.
//
//   node brokers/moomooca/moomooca_scraping.mjs

import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";

const HOSTS = ["https://www.moomoo.com", "https://www.moomooapp.com"];
const LIST_PATH = "/quote-api/quote-v2/get-stock-list";
const TSX_DIRECTORY = "https://www.tsx.com/json/company-directory/search/";
const TMX_OUT = "https://www.tsx.com/json/company-directory/";
const NEX_PAGE = "https://www.tsx.com/en/listings/tsx-and-tsxv-issuer-resources/tsx-venture-exchange-issuer-resources/nex/listed-companies";
const TSX_COMPANIES = "https://www.tsx.com/en/resource/571";
const CSE_LIST = "https://webapi-backup.thecse.com/trading/listed/market/security_maintenance.json";
const CBOE_LIST = "https://www-api.cboe.com/ca/equities/listing-directory-data/";
const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const TRADE_HALTS = "https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CA_MARKET = 30;
const US_MARKET = 2;
const PAGE_SIZE = 50;
const GAP = 8000;
const BLOCK_WAIT = 300_000;

const PLACE = {
  tsx: { exchange: "Toronto Stock Exchange", mic: "XTSE" },
  tsxv: { exchange: "TSX Venture", mic: "XTSX" },
  nex: { exchange: "NEX", mic: "XTNX" },
  cse: { exchange: "Canadian Securities Exchange", mic: "XCNQ" },
  cboe: { exchange: "Cboe Canada", mic: "NEOE" },
};

// Suffixes of Canadian lines that are not shares, units or ETFs:
// warrants, rights, debentures, notes, subscription and instalment
// receipts.
const NOT_EQUITY = /\.(WT|RT|DB|NT|R|IR|SR)(\.|$)/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function quoteToken(params) {
  const body = JSON.stringify(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])));
  const hex = createHmac("sha512", "quote_web").update(body).digest("hex");
  return createHash("sha256").update(hex.slice(0, 10)).digest("hex").slice(0, 10);
}

async function fetchBytes(url, accept = "*/*") {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// ---- moomoo list ----------------------------------------------------------

let lastCall = 0;
let host = 0;

async function listPage(params) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const wait = Math.max(0, lastCall + GAP - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    const target = new URL(LIST_PATH, HOSTS[host]);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
    let text = "";
    try {
      const response = await fetch(target, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: `${HOSTS[host]}/quote`, "quote-token": quoteToken(params) },
        signal: AbortSignal.timeout(60_000),
      });
      text = await response.text();
    } catch (error) {
      text = String(error.message || error);
    }
    if (text.startsWith("{")) {
      const payload = JSON.parse(text);
      if (payload.code === 0) return payload.data;
      throw new Error(`moomoo list answered code ${payload.code}: ${payload.message}`);
    }
    // "403 - Operations too frequent" is an HTML page: try the other
    // domain, and wait once both have refused.
    host = (host + 1) % HOSTS.length;
    if (host === 0) {
      console.error(`moomoo list page ${params.page}: blocked, waiting`);
      await sleep(BLOCK_WAIT);
    }
  }
  throw new Error("the moomoo list stayed blocked");
}

// Two back ends answer the endpoint in turn and do not hold the same
// lines: on 21 October 2026 they announced 6,074 and 5,887 Canadian lines,
// and 11,878 and 11,879 US lines, and during the US session the US totals
// moved every hour (11,882, 11,887) as lines were added. The list is
// sorted by market value, which moves with prices. So no single book can
// be walked to the end in a day: lines are gathered per announced total
// (one back end's book), a page counts once a book within 0.5% of the
// largest recent total has answered it (a back end far behind, the 5,887
// one, is asked again), and the walk ends when those books together hold
// as many codes as the largest announces. A line that crossed a page
// while the walk went on, or one added that day and held only by the
// newest book, can be missed: up to 0.3% short is accepted once every
// page has been read, and printed (the US walk of 21 October ended 20
// codes short of 11,890); more and the pages are walked again. A code the near books hold that the exchange no longer lists
// falls out at the exchange check below. Every answer is saved to
// moomooca-list-cache.json, so a stopped run resumes, and a complete list
// is used for three days.
const LIST_CACHE = new URL("moomooca-list-cache.json", import.meta.url);
const LIST_DAYS = 3;
const BOOK_HOURS = 20;
const NEAR = 0.005;
const SHORT = 0.003;
const WINDOW = 24;
const PASSES = 4;

function readCache() {
  return fs.existsSync(LIST_CACHE) ? JSON.parse(fs.readFileSync(LIST_CACHE, "utf8")) : {};
}

// Written through a temporary file, so a full disk leaves the last copy
// whole; the walk goes on without the cache then.
function saveCache(update) {
  const temporary = new URL("moomooca-list-cache.json.tmp", import.meta.url);
  try {
    fs.writeFileSync(temporary, JSON.stringify({ ...readCache(), ...update }));
    fs.renameSync(temporary, LIST_CACHE);
  } catch (error) {
    console.error(`moomoo list cache not saved: ${error.message}`);
    fs.rmSync(temporary, { force: true });
  }
}

async function marketList(label, marketType, minimum) {
  const cache = readCache();
  const done = cache[label];
  if (done && Date.now() - Date.parse(done.at) < LIST_DAYS * 86400_000 && done.lines?.length >= done.total * (1 - SHORT)) return done;

  // total -> { at, count, pages: [pages it answered], codes: { code: line } },
  // kept from earlier runs.
  const books = Object.fromEntries(
    Object.entries(cache[`${label} books`] || {}).filter(([, book]) => Date.now() - Date.parse(book.at) < BOOK_HOURS * 3600_000),
  );
  const recent = [];
  const lead = () => Math.max(0, ...(recent.length ? recent : Object.keys(books).map(Number)));
  const near = (total) => total <= lead() && total >= lead() * (1 - NEAR);
  const family = () => Object.entries(books).filter(([total]) => near(Number(total)));
  const held = () => {
    const codes = {};
    for (const [, book] of family()) Object.assign(codes, book.codes);
    return codes;
  };
  // page -> total of the book that answered it in this walk.
  const answered = new Map();
  for (const [total, book] of family()) for (const page of book.pages || []) answered.set(page, Number(total));
  const count = () => Math.max(0, ...family().map(([, book]) => book.count));
  let passes = 0;
  let calls = 0;
  for (let page = 0; ; page += 1) {
    const top = lead();
    if (top && Object.keys(held()).length >= top) break;
    if (top && page >= count()) {
      if ([...answered.values()].filter(near).length >= count()) {
        if (Object.keys(held()).length >= top * (1 - SHORT)) break;
        passes += 1;
        if (passes >= PASSES) throw new Error(`the moomoo ${label} list holds ${Object.keys(held()).length} of ${top} codes after ${passes} walks`);
        // Lines go missing where two pages in a row came from different
        // books: those pages are asked again.
        const owner = new Map(answered);
        for (let at = 1; at < count(); at += 1) if (owner.get(at) !== owner.get(at - 1)) answered.delete(at);
      }
      page = -1;
      continue;
    }
    if (top && answered.has(page) && near(answered.get(page))) continue;
    const data = await listPage({ marketType, plateType: 1, rankType: 3, page, pageSize: PAGE_SIZE });
    const total = data?.pagination?.total;
    const pageCount = data?.pagination?.pageCount;
    if (!Number.isInteger(total) || !Number.isInteger(pageCount) || !Array.isArray(data.list)) throw new Error(`the moomoo ${label} list has no pagination`);
    const book = (books[total] ||= { at: new Date().toISOString(), count: pageCount, pages: [], codes: {} });
    for (const item of data.list) {
      const code = normalize(item.stockCode).toUpperCase();
      if (!code || item.marketLabel !== label) throw new Error(`moomoo ${label} list line ${JSON.stringify(item).slice(0, 120)}`);
      book.codes[code] = { stockCode: item.stockCode, name: item.name, marketLabel: item.marketLabel, instrumentType: item.instrumentType };
    }
    book.pages ||= [];
    if (!book.pages.includes(page)) book.pages.push(page);
    saveCache({ [`${label} books`]: books });
    recent.push(total);
    if (recent.length > WINDOW) recent.shift();
    calls += 1;
    if (calls % 20 === 0) console.error(`moomoo ${label} list: ${Object.keys(held()).length} of ${lead()} codes after ${calls} calls`);
    if (near(total)) answered.set(page, total);
    else page -= 1;
  }
  const top = lead();
  if (top < minimum) throw new Error(`the moomoo ${label} list announces ${top} lines`);
  const lines = Object.values(held());
  const list = { at: new Date().toISOString(), total: top, lines, totals: Object.keys(books).map(Number) };
  saveCache({ [label]: list, [`${label} books`]: undefined });
  return list;
}

// ---- exchange lists -------------------------------------------------------

async function tmxDirectory(board) {
  const found = JSON.parse((await fetchBytes(`${TSX_DIRECTORY}${board}/%5E*`, "application/json")).toString("utf8"));
  const symbols = new Map();
  for (const company of found.results || []) {
    for (const item of company.instruments || []) symbols.set(normalize(item.symbol).toUpperCase(), normalize(item.name || company.name));
  }
  if (symbols.size < 1000) throw new Error(`the ${board} directory gave ${symbols.size} symbols`);
  return symbols;
}

// TMX's suspended and delisted company lists for a board: root symbols.
async function tmxOut(list, board) {
  const found = JSON.parse((await fetchBytes(`${TMX_OUT}${list}/${board}`, "application/json")).toString("utf8"));
  if (!Array.isArray(found?.results) || found.length !== found.results.length || found.results.some((company) => !normalize(company.symbol))) {
    throw new Error(`the TMX ${list} list for ${board} has changed shape`);
  }
  return new Set(found.results.map((company) => normalize(company.symbol).toUpperCase()));
}

// NEX symbol -> its issuer's status ("Active", "Suspended", "Halted"). The
// NEX page shows a table of its issuers and carries their data (status,
// instruments) as a script variable. That data also keeps issuers the
// table no longer shows (55 "Active" ones on 21 October 2026, AUT.H and
// BM.H among them, with no TMX quote): an issuer counts only when one of
// its symbols is in the table, and then with all its classes (RII.K
// beside RII.H).
const NEX_STATUS = ["Active", "Suspended", "Halted"];
async function nexSymbols() {
  const html = (await fetchBytes(NEX_PAGE, "text/html")).toString("utf8");
  const data = html.match(/var nex_company_data = (\{[\s\S]*?\});\s*\n/)?.[1];
  if (!data) throw new Error("the NEX page has no issuer data");
  const shown = new Set([...html.matchAll(/>\s*([A-Z0-9]{1,6}(?:\.[A-Z]{1,2})?\.H)\s*</g)].map((match) => match[1]));
  if (shown.size < 100) throw new Error(`the NEX table lists ${shown.size} symbols`);
  const symbols = new Map();
  for (const [root, issuer] of Object.entries(JSON.parse(data))) {
    if (!NEX_STATUS.includes(issuer?.status) || !issuer.instruments || typeof issuer.instruments !== "object") {
      throw new Error(`the NEX issuer ${root} reads ${JSON.stringify(issuer).slice(0, 120)}`);
    }
    const instruments = Object.keys(issuer.instruments).map((symbol) => normalize(symbol).toUpperCase());
    if (!instruments.some((symbol) => shown.has(symbol))) continue;
    for (const symbol of instruments) symbols.set(symbol, issuer.status);
  }
  const missing = [...shown].filter((symbol) => !symbols.has(symbol));
  if (missing.length) throw new Error(`the NEX table shows ${missing.slice(0, 5).join(", ")} without issuer data`);
  const active = [...symbols.values()].filter((status) => status === "Active").length;
  if (symbols.size < 100 || active < 50) throw new Error(`the NEX page lists ${symbols.size} symbols, ${active} active`);
  return symbols;
}

function columnIndex(ref) {
  let n = 0;
  for (const char of ref) {
    if (!/[A-Z]/i.test(char)) break;
    n = n * 26 + char.toUpperCase().charCodeAt(0) - 64;
  }
  return n - 1;
}

function zipFiles(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a zip archive");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("broken zip directory");
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const stored = bytes.subarray(start, start + compressed);
    files.set(name, method === 0 ? stored : inflateRawSync(stored));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function unescapeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

// The rows of the first sheet of a workbook.
function firstSheet(bytes) {
  const files = zipFiles(bytes);
  const tag = "(?:[a-z0-9]+:)?";
  const shared = [];
  const sharedXml = files.get("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const item of sharedXml.toString("utf8").matchAll(new RegExp(`<${tag}si\\b[^>]*>([\\s\\S]*?)</${tag}si>`, "g"))) {
      shared.push([...item[1].matchAll(new RegExp(`<${tag}t\\b[^>]*>([\\s\\S]*?)</${tag}t>`, "g"))].map((node) => node[1]).join(""));
    }
  }
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("the TMX workbook has no first sheet");
  const rows = [];
  for (const row of sheet.toString("utf8").matchAll(new RegExp(`<${tag}row\\b[^>]*>([\\s\\S]*?)</${tag}row>`, "g"))) {
    const values = {};
    for (const cell of row[1].matchAll(new RegExp(`<${tag}c\\b([^>]*?)/>|<${tag}c\\b([^>]*)>([\\s\\S]*?)</${tag}c>`, "g"))) {
      if (cell[3] === undefined) continue;
      const ref = cell[2].match(/\br="([A-Z]+)\d+"/i)?.[1] || "A";
      const type = cell[2].match(/\bt="([^"]+)"/)?.[1] || "";
      const raw = cell[3].match(new RegExp(`<${tag}v>([\\s\\S]*?)</${tag}v>`))?.[1] ?? "";
      const inline = [...cell[3].matchAll(new RegExp(`<${tag}t\\b[^>]*>([\\s\\S]*?)</${tag}t>`, "g"))].map((node) => node[1]).join("");
      values[columnIndex(ref)] = unescapeXml(type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? inline : raw);
    }
    if (!Object.keys(values).length) continue;
    const width = Math.max(...Object.keys(values).map(Number)) + 1;
    rows.push(Array.from({ length: width }, (_, index) => values[index] ?? ""));
  }
  return rows;
}

// TSX root ticker -> TMX sector ("ETP", "CDR", "Mining", ...).
async function tsxSectors() {
  const rows = firstSheet(await fetchBytes(TSX_COMPANIES));
  const header = rows.findIndex((row) => normalize(row[0]) === "Co_ID");
  if (header < 0) throw new Error("the TMX listed-companies sheet has no header");
  const tickerAt = rows[header].findIndex((cell) => /^Root\s*Ticker$/i.test(normalize(cell)));
  const sectorAt = rows[header].findIndex((cell) => normalize(cell) === "Sector");
  if (tickerAt < 0 || sectorAt < 0) throw new Error("the TMX listed-companies sheet is missing a column");
  const sectors = new Map();
  for (const row of rows.slice(header + 1)) {
    const ticker = normalize(row[tickerAt]).toUpperCase();
    if (ticker) sectors.set(ticker, normalize(row[sectorAt]));
  }
  if ([...sectors.values()].filter((sector) => sector === "ETP").length < 800) throw new Error("the TMX listed-companies sheet has too few ETPs");
  return sectors;
}

async function cseList() {
  const payload = JSON.parse((await fetchBytes(CSE_LIST, "application/json")).toString("utf8"));
  const list = payload?.full_list;
  if (!Array.isArray(list) || list.length < 500) throw new Error(`the CSE list has ${list?.length ?? 0} lines`);
  // Every line is kept with its status; only "Active" lines are written.
  const lines = new Map();
  for (const item of list) {
    if (!/^(Active|Suspended|Halted\b.*|Delisted)$/.test(item.status || "")) throw new Error(`the CSE line ${item.symbol} has status ${JSON.stringify(item.status)}`);
    const code = normalize(item.symbol).toUpperCase();
    // A delisted line can share its symbol with a new listing.
    if (item.status === "Delisted" && lines.has(code)) continue;
    lines.set(code, item);
  }
  if ([...lines.values()].filter((item) => item.status === "Active").length < 400) throw new Error("the CSE list has too few active lines");
  return lines;
}

async function cboeList() {
  const payload = JSON.parse((await fetchBytes(CBOE_LIST, "application/json")).toString("utf8"));
  const list = payload?.data;
  if (!Array.isArray(list) || list.length < 300) throw new Error(`the Cboe Canada directory has ${list?.length ?? 0} lines`);
  return new Map(list.map((item) => [normalize(item.symbol).toUpperCase(), item]));
}

// US symbol -> listing exchange and ETF flag, from the Nasdaq Trader
// symbol directory. Test issues are left out.
const US_PLACE = {
  Q: { exchange: "Nasdaq", mic: "XNAS" },
  N: { exchange: "New York Stock Exchange", mic: "XNYS" },
  A: { exchange: "NYSE American", mic: "XASE" },
  P: { exchange: "NYSE Arca", mic: "ARCX" },
  Z: { exchange: "Cboe BZX", mic: "BATS" },
  F: { exchange: "NYSE Texas", mic: "XCHI" },
};

// The web host sometimes answers with a bot check: the same files are on
// its FTP server.
async function directoryText(url, header) {
  const text = await fetchBytes(url, "text/plain").then((bytes) => bytes.toString("utf8"), () => "");
  if (text.startsWith(header)) return text;
  const ftp = `ftp://ftp.nasdaqtrader.com/symboldirectory/${url.split("/").at(-1)}`;
  const run = spawnSync("curl", ["-s", "--max-time", "120", ftp], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (run.status === 0 && run.stdout.startsWith(header)) return run.stdout;
  throw new Error(`the symbol directory ${url} could not be read`);
}

async function usDirectory() {
  const nasdaq = await directoryText(NASDAQ_LISTED, "Symbol|Security Name|");
  const other = await directoryText(OTHER_LISTED, "ACT Symbol|Security Name|");
  const book = new Map();
  const add = (symbol, place, etf, title) => {
    const code = normalize(symbol).toUpperCase();
    if (code && !book.has(code)) book.set(code, { ...place, etf, title: normalize(title) });
  };
  for (const cells of nasdaq.split(/\r?\n/).slice(1).map((line) => line.split("|"))) {
    if (cells.length < 8 || cells[3] === "Y") continue;
    add(cells[0], US_PLACE.Q, cells[6] === "Y", cells[1]);
  }
  for (const cells of other.split(/\r?\n/).slice(1).map((line) => line.split("|"))) {
    if (cells.length < 8 || cells[6] === "Y" || !US_PLACE[cells[2]]) continue;
    add(cells[0], US_PLACE[cells[2]], cells[4] === "Y", cells[1]);
    if (cells[7] && cells[7] !== cells[0]) add(cells[7], US_PLACE[cells[2]], cells[4] === "Y", cells[1]);
  }
  if (book.size < 8000) throw new Error(`the symbol directory has ${book.size} names`);
  return book;
}

// A line the directory does not flag as an ETF that is one all the same:
// an exchange-traded note, or a trust holding gold, silver, platinum,
// palladium, bitcoin, ether or a currency (GraniteShares Gold Trust, BAR).
// A closed-end fund's name ("Gold & Income Trust") does not match.
const ETF_BY_NAME = /\bETNs?\b|\bExchange[- ]Traded Notes?\b|\b(Gold|Silver|Platinum|Palladium|Precious Metals?|Bitcoin|Ether(eum)?|Crypto|Currency) (Trust|Shares)\b/i;

// US symbols with a halt still open (no resumption trade time) that began
// before today in New York, from Nasdaq Trader's trade-halts feed, which
// covers every US listing market. The web host sometimes answers with a
// bot check: curl is tried then.
async function openHalts() {
  let xml = await fetchBytes(TRADE_HALTS, "application/rss+xml").then((bytes) => bytes.toString("utf8"), () => "");
  if (!/<description>NASDAQ Trade Halts<\/description>/.test(xml)) {
    const run = spawnSync("curl", ["-s", "--max-time", "120", "-A", UA, TRADE_HALTS], { encoding: "utf8", maxBuffer: 16 << 20 });
    xml = run.status === 0 ? run.stdout : "";
  }
  if (!/<description>NASDAQ Trade Halts<\/description>/.test(xml)) throw new Error("the Nasdaq Trader trade-halts feed could not be read");
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  const announced = Number(xml.match(/<ndaq:numItems>(\d+)<\/ndaq:numItems>/)?.[1]);
  if (announced !== items.length) throw new Error(`the trade-halts feed announces ${announced} halts and holds ${items.length}`);
  // A self-closed tag is an empty field, a missing one a change of shape.
  const field = (item, tag) => {
    const match = item.match(new RegExp(`<ndaq:${tag}\\s*/>|<ndaq:${tag}>([^<]*)</ndaq:${tag}>`));
    return match ? normalize(match[1]) : null;
  };
  const [month, day, year] = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("/");
  const today = `${year}-${month}-${day}`;
  const halts = new Map();
  for (const item of items) {
    const symbol = field(item, "IssueSymbol");
    const date = field(item, "HaltDate")?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const resumed = field(item, "ResumptionTradeTime");
    if (!symbol || !date || resumed === null || field(item, "ReasonCode") === null) throw new Error(`the trade-halts feed has an item it cannot read: ${item.slice(0, 160)}`);
    const since = `${date[3]}-${date[1]}-${date[2]}`;
    if (!resumed && since < today) halts.set(symbol.toUpperCase(), `${field(item, "ReasonCode")} since ${since}`);
  }
  return halts;
}

// moomoo writes a share class with a dot (BRK.B), the directory's Nasdaq
// file with a dot and its other file with a slash or a dash.
function usListing(book, code) {
  return book.get(code) || book.get(code.replaceAll(".", "/")) || book.get(code.replaceAll(".", "-"));
}

// ---- rows -----------------------------------------------------------------

function rowOf({ ticker, name, place, currency, type, source }) {
  return {
    query: ticker,
    ticker,
    name: normalize(name) || ticker,
    exchange: place.exchange,
    mic: place.mic,
    currency,
    type,
    isin: "",
    raw: [ticker, normalize(name), source, currency, type].filter(Boolean).join(" | "),
  };
}

const dropped = {};
const examples = {};
function drop(reason, example = "") {
  dropped[reason] = (dropped[reason] || 0) + 1;
  if (example && (examples[reason] ||= []).length < 6) examples[reason].push(example);
}
const retyped = {};
function retype(reason) {
  retyped[reason] = (retyped[reason] || 0) + 1;
}

const [tsx, tsxv, nex, sectors, cse, cboe, america, halts, ...tmxLists] = await Promise.all([
  tmxDirectory("tsx"),
  tmxDirectory("tsxv"),
  nexSymbols(),
  tsxSectors(),
  cseList(),
  cboeList(),
  usDirectory(),
  openHalts(),
  tmxOut("suspended", "tsx"),
  tmxOut("delisted", "tsx"),
  tmxOut("suspended", "tsxv"),
  tmxOut("delisted", "tsxv"),
]);
// board -> the reason a code is out there: a suspended company's every
// class (matched on the root symbol), a delisted line itself (its symbol
// may be given to a new listing later).
const [tsxSuspended, tsxDelisted, tsxvSuspended, tsxvDelisted] = tmxLists;
function tmxOutReason(suspended, delisted, code) {
  if (suspended.has(code.split(".")[0])) return "on TMX's suspended list";
  if (delisted.has(code)) return "on TMX's delisted list";
  return "";
}
const { lines: caLines, total: caTotal } = await marketList("CA", CA_MARKET, 4000);

const rows = [];
for (const item of caLines) {
  const code = normalize(item.stockCode).toUpperCase();
  const name = normalize(item.name);
  const example = `${code} ${name}`;
  if (![3, 4, 12].includes(item.instrumentType)) {
    drop("CA other moomoo type", example);
    continue;
  }
  if (NOT_EQUITY.test(code)) {
    drop("CA warrant, right, debenture, note or receipt", example);
    continue;
  }
  const usd = /\.U$/.test(code);
  const fund = item.instrumentType === 4;
  let placed = 0;
  const tsxOut = tsx.has(code) ? tmxOutReason(tsxSuspended, tsxDelisted, code) : "";
  if (tsxOut) {
    drop(`CA TSX ${tsxOut}`, example);
    placed += 1;
  } else if (tsx.has(code)) {
    const sector = sectors.get(code.split(".")[0]) || "";
    const cdr = sector === "CDR" || /\bCDR\b/i.test(`${name} ${tsx.get(code)}`);
    // The monthly sheet lacks the newest listings: those keep moomoo's type.
    const type = sector === "ETP" ? "ETF" : cdr || sector ? "STOCK" : fund ? "ETF" : "STOCK";
    rows.push(rowOf({ ticker: code, name, place: PLACE.tsx, currency: usd ? "USD" : "CAD", type, source: `CA TSX ${sector}`.trim() }));
    placed += 1;
  }
  const tsxvOut = tsxv.has(code) ? tmxOutReason(tsxvSuspended, tsxvDelisted, code) : "";
  if (tsxvOut) {
    drop(`CA TSX Venture ${tsxvOut}`, example);
    placed += 1;
  } else if (tsxv.has(code)) {
    rows.push(rowOf({ ticker: code, name, place: PLACE.tsxv, currency: usd ? "USD" : "CAD", type: fund ? "ETF" : "STOCK", source: "CA TSXV" }));
    placed += 1;
  }
  if (nex.has(code)) {
    if (nex.get(code) === "Active") rows.push(rowOf({ ticker: code, name, place: PLACE.nex, currency: usd ? "USD" : "CAD", type: "STOCK", source: "CA NEX Active" }));
    else drop(`CA NEX issuer ${nex.get(code)}`, example);
    placed += 1;
  }
  const onCse = cse.get(code);
  if (onCse) {
    if (onCse.status !== "Active") drop(`CA CSE ${onCse.status}`, example);
    else if (/^(Equity|ETF)$/i.test(onCse.security_type)) {
      rows.push(rowOf({
        ticker: code,
        name,
        place: PLACE.cse,
        currency: /^[A-Z]{3}$/.test(onCse.currency) ? onCse.currency : "CAD",
        type: /^ETF$/i.test(onCse.security_type) ? "ETF" : "STOCK",
        source: `CA CSE ${onCse.security_type} ${onCse.status}`,
      }));
    } else drop("CA CSE debt or other", example);
    placed += 1;
  }
  const onCboe = cboe.get(code);
  if (onCboe) {
    if (["etf", "equity", "dr", "cef"].includes(onCboe.security)) {
      rows.push(rowOf({
        ticker: code,
        name,
        place: PLACE.cboe,
        currency: /^[A-Z]{3}$/.test(onCboe.currency) ? onCboe.currency : "CAD",
        type: onCboe.security === "etf" ? "ETF" : "STOCK",
        source: `CA Cboe Canada ${onCboe.security}/${onCboe.security_sub_type}`,
      }));
    } else drop("CA Cboe Canada debt or warrant", example);
    placed += 1;
  }
  if (!placed) drop("CA on no Canadian exchange list", example);
}
const caRows = rows.length;
if (caRows < 4000) throw new Error(`only ${caRows} Canadian rows`);

const { lines: usLines, total: usTotal } = await marketList("US", US_MARKET, 9000);
for (const item of usLines) {
  const code = normalize(item.stockCode).toUpperCase();
  const name = normalize(item.name);
  if (![3, 4, 12].includes(item.instrumentType)) {
    drop("US other moomoo type", `${code} ${name}`);
    continue;
  }
  const place = usListing(america, code);
  if (!place) {
    drop("US not in the symbol directory (OTC or delisted)", `${code} ${name}`);
    continue;
  }
  const halt = halts.get(code) || halts.get(code.replaceAll(".", "-")) || halts.get(code.replaceAll(".", "/")) || halts.get(code.replaceAll(".", ""));
  if (halt) {
    drop("US halt still open from before today", `${code} ${halt}`);
    continue;
  }
  const byName = ETF_BY_NAME.test(place.title) || ETF_BY_NAME.test(name);
  const type = place.etf || byName ? "ETF" : "STOCK";
  if (type === "STOCK" && item.instrumentType === 4) retype("US moomoo fund the directory does not flag as an ETF (closed-end fund, BDC) written as a share");
  if (type === "ETF" && item.instrumentType !== 4 && !place.etf) retype("US moomoo share named an ETN or commodity trust written as an ETF");
  rows.push({
    query: code,
    ticker: code,
    name: name || code,
    exchange: place.exchange,
    mic: place.mic,
    currency: "USD",
    type,
    isin: "",
    raw: [code, name, `US ${place.exchange}`, "USD", type].join(" | "),
  });
}
if (rows.length - caRows < 9000) throw new Error(`only ${rows.length - caRows} US rows`);

for (const [ticker, exchange, type] of [
  ["RY", "Toronto Stock Exchange", "STOCK"],
  ["XIU", "Toronto Stock Exchange", "ETF"],
  ["NVDA", "Toronto Stock Exchange", "STOCK"],
  ["AAPL", "Nasdaq", "STOCK"],
  ["SPY", "NYSE Arca", "ETF"],
  ["XLE", "NYSE Arca", "ETF"],
  ["ARKK", "Cboe BZX", "ETF"],
]) {
  if (!rows.some((row) => row.ticker === ticker && row.exchange === exchange && row.type === type)) throw new Error(`${ticker} ${type} on ${exchange} missing`);
}
for (const place of [...Object.values(PLACE), US_PLACE.Z]) {
  if (!rows.some((row) => row.exchange === place.exchange)) throw new Error(`no ${place.exchange} rows`);
}

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("moomooca-parsed.json", import.meta.url), JSON.stringify(written, null, 2));

const counts = {};
for (const row of written) counts[`${row.exchange} ${row.currency} ${row.type}`] = (counts[`${row.exchange} ${row.currency} ${row.type}`] || 0) + 1;
console.error(`moomoo lists: CA ${caLines.length} codes of ${caTotal} announced (${caRows} rows), US ${usLines.length} of ${usTotal} (${rows.length - caRows} rows). Left out: ${JSON.stringify(dropped)}. Retyped: ${JSON.stringify(retyped)}`);
if (Object.keys(examples).length) console.error(`examples: ${JSON.stringify(examples)}`);
console.error(`${written.length} rows, ${written.filter((row) => row.isin).length} with ISIN (${Object.entries(counts).map(([key, count]) => `${count} ${key}`).join(", ")})`);
