// Shared by the nine IBKR entity scrapers (ibkrus, ibkrca, ibkrch, ibkruk,
// ibkrau, ibkrsg, ibkrhk, ibkrjp, ibkrin): IBKR's product lists carry lines
// that cannot be bought (dead, suspended, sell-only or never-launched
// contracts IBKR keeps on file). Each rule below drops them against the
// exchange's own list, or against IBKR's own rule, and was checked on that
// source on 2026-10-20 before it was applied. A rule only touches the rows
// of its own market, so an entity without that market reads nothing.
//
// 1. OTC Markets: no Caveat Emptor or Grey Market names. IBKR FAQ 2892
//    "U.S. Microcap Stock Restrictions": "We will not accept transfers of or
//    opening orders for, U.S. Microcap Stocks designated by OTC as Caveat
//    Emptor or Grey Market from any client."
//      https://www.interactivebrokers.com/lib/cstools/faq/#/content/1169366501
//    IBKR's list of what it designates as U.S. Microcaps (by conid, "updated
//    daily", linked from that FAQ), crossed with the OTC Markets stock
//    screener's Grey tier (market 30) and Caveat Emptor flag (ce=true):
//      https://www.interactivebrokers.com/download/us_microcaps.csv
//      https://www.otcmarkets.com/research/stock-screener/api?market=30
//      https://www.otcmarkets.com/research/stock-screener/api?ce=true
//    otcmarkets.com answers plain HTTP clients with a "Temporarily
//    Unavailable" page, so the screener is read from a headless Chrome
//    (puppeteer-core), as a browser does.
//    Expert Market names (screener market 40) go too, by the owner's
//    decision of 2026-10-20: IBKR's FAQ "Can I access or view market data on
//    the Expert Market?" says "IBKR clients cannot access or view market data
//    on the Expert Market", so a client cannot see a price to buy at. IBKR
//    does not itself say it refuses the order.
//      https://www.otcmarkets.com/research/stock-screener/api?market=40
//
// 2. Stock Connect (Shanghai and Shenzhen Connect, STAR Market, ChiNext:
//    IBKR's Northbound books): a line is kept only when HKEX lists it as
//    "China Connect Securities (eligible for both buy and sell)"; the
//    others are sell-only (HKEX file titles).
//      https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SSE_Securities.xls
//      https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SZSE_Securities.xls
//
// 3. London (LSE and London IOB): no suspended lines. The LSE instrument
//    API files trading status "S" ("S c"); the LSE's own page shows it as
//    "Trading Status: Suspended - Closed" (checked on SPMU, last close
//    6 March 2024). The LSE price explorer lists every equity and ETP line
//    with its mid price; a suspended line has none (SPMU, PYX, OIH, RKMD,
//    ATAD: midPrice null). So only the lines with no mid price, or that the
//    explorer does not list, are asked for their status (about 110 of
//    6,230 on 2026-10-20; the API blocks a burst of calls for minutes),
//    and a line is dropped only when the LSE answers for its TIDM with the
//    same ISIN and status S. A line the LSE does not answer for is kept.
//      https://api.londonstockexchange.com/api/v1/pages?path=live-markets/market-data-dashboard/price-explorer&parameters=categories%3DEQUITY%2CETFS%26size%3D1000%26page%3D0
//      https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>
//      https://www.londonstockexchange.com/stock/SPMU/spiritus-mundi-plc/company-page
//
// 4. London IOB: a depositary receipt is kept only when the LSE's price
//    explorer still files it under Equity > IOB (by TIDM or ISIN); GDRs
//    the LSE no longer lists (SAUD, LKCS) go.
//      https://www.londonstockexchange.com/live-markets/market-data-dashboard/price-explorer
//      https://api.londonstockexchange.com/api/v1/pages?path=live-markets/market-data-dashboard/price-explorer&parameters=subcategories%3D2%26size%3D100
//
// 5. ASX: ordinary shares, units and ETPs only. A code is kept when it is
//    on the ASX list of listed companies (one code per listed entity) or on
//    the ETP list of the ASX investment-products monthly report (ETF,
//    Active, Complex, SP). Any other code (a second share class, an ETP too
//    new for the report) is kept only when the ASX company API files it as
//    an ordinary security (securityType 1) that is not a deferred-settlement
//    line ("Ordinary Fully Paid Deferred"), or as a quoted ETP (7, 16, 33,
//    36, 53). Capital notes and preference shares (21, 17), convertible
//    bonds (51), deferred "-NEW" lines and codes the ASX no longer quotes
//    (the XTB YTM* bond units) go.
//      https://www.asx.com.au/asx/research/ASXListedCompanies.csv
//      https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report.html
//      https://asx.api.cmfyapp.com/asx-research/1.0/companies/<CODE>/header (and /key-statistics)
//
// 6. US national tape (Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX,
//    Texas): a title is kept only when the Nasdaq Trader symbol directory
//    lists it, test issues excluded. SPAC units before listing, when-issued
//    lines, ETFs not launched and dead listings go.
//      https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//      https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//      https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs
//
// 7. Hong Kong: a code is kept only when it is on HKEX's List of
//    Securities.
//      https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MICROCAPS = "https://www.interactivebrokers.com/download/us_microcaps.csv";
const OTC_SCREENER = "https://www.otcmarkets.com/research/stock-screener";
const CONNECT = {
  XSHG: "https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SSE_Securities.xls",
  XSHE: "https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SZSE_Securities.xls",
};
const LSE_LINE = "https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/";
const ASX_COMPANIES = "https://www.asx.com.au/asx/research/ASXListedCompanies.csv";
const ASX_PRODUCTS = "https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report.html";
const ASX_API = "https://asx.api.cmfyapp.com/asx-research/1.0/companies/";
const HKEX = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx";

const US_MICS = new Set(["XNYS", "XNAS", "XASE", "ARCX", "BATS", "TXSE"]);
const ASX_ETP_KEEP = new Set(["ETF", "Active", "Complex", "SP"]);
const ASX_ETP_TYPES = new Set([7, 16, 33, 36, 53]);
const ASX_OTHER_TYPES = { 17: "preference share (securityType 17)", 21: "capital note / hybrid (securityType 21)", 51: "convertible bond (securityType 51)" };
const MONTH = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// GET with retries. A 404 is an answer (null), not a failure.
async function get(url, { headers = {}, as = "text", notFound = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(90_000) });
      if (response.ok) return as === "json" ? response.json() : as === "bytes" ? Buffer.from(await response.arrayBuffer()) : response.text();
      if (notFound && (response.status === 404 || response.status === 400)) return null;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// Runs a Python reader over a downloaded workbook (xlrd / openpyxl, as
// brokers/moomooau does) and returns its JSON.
function python(script, file) {
  const run = spawnSync("python3", ["-c", script, file], { encoding: "utf8", maxBuffer: 50_000_000 });
  if (run.status !== 0) throw new Error(run.stderr || "python3 failed");
  return JSON.parse(run.stdout);
}

async function withWorkbook(url, script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibkr-lists-"));
  try {
    const file = path.join(dir, path.basename(new URL(url).pathname));
    fs.writeFileSync(file, await get(url, { as: "bytes" }));
    return python(script, file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function pool(items, size, task) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await task(items[next++]);
    })
  );
}

// ---- 1. OTC Markets ------------------------------------------------------

async function ibkrMicrocaps() {
  const text = await get(MICROCAPS);
  if (!/^#SYMBOL,MAIN_EXCHANGE,DESCRIPTION,IB_CONTRACT_ID/.test(text)) throw new Error("the IBKR microcap list has an unexpected header");
  const conids = new Set();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const conid = line.split(",").pop().trim();
    if (/^\d+$/.test(conid)) conids.add(conid);
  }
  if (conids.size < 3000) throw new Error(`the IBKR microcap list has ${conids.size} lines`);
  return conids;
}

// symbol -> "Grey Market" / "Caveat Emptor" / "Expert Market" from the OTC
// Markets screener.
async function otcBarred() {
  const { default: puppeteer } = await import("puppeteer-core");
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"] });
    try {
      const page = await browser.newPage();
      await page.setUserAgent(UA);
      await page.goto(OTC_SCREENER, { waitUntil: "domcontentloaded", timeout: 90_000 });
      const barred = new Map();
      for (const [filter, label] of [["market=30", "Grey Market"], ["ce=true", "Caveat Emptor"], ["market=40", "Expert Market"]]) {
        let count = null;
        const symbols = new Set();
        for (let number = 0; number < 200; number += 1) {
          const query = `/research/stock-screener/api?${filter}&sortField=symbol&sortOrder=asc&page=${number}&pageSize=100`;
          const text = await page.evaluate(async (url) => (await fetch(url)).text(), query);
          const body = JSON.parse(JSON.parse(text));
          count ??= body.count;
          for (const stock of body.stocks || []) {
            symbols.add(stock.symbol);
            if (!barred.has(stock.symbol) || label === "Expert Market") barred.set(stock.symbol, label);
          }
          if ((body.stocks || []).length < 100) break;
          await sleep(300);
        }
        if (!count || symbols.size !== count) throw new Error(`OTC Markets ${filter}: announced ${count}, read ${symbols.size}`);
      }
      return barred;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      await browser.close();
    }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`the OTC Markets screener could not be read: ${last}`);
}

// ---- 2. Stock Connect ----------------------------------------------------

const CONNECT_READER = `
import json, sys, xlrd
sheet = xlrd.open_workbook(sys.argv[1]).sheet_by_index(0)
title = str(sheet.cell_value(0, 0))
codes = []
for row in range(5, sheet.nrows):
    value = sheet.cell_value(row, 1)
    if isinstance(value, float):
        codes.append(str(int(value)).zfill(6))
    elif str(value).strip().isdigit():
        codes.append(str(value).strip().zfill(6))
json.dump({"title": title, "codes": codes}, sys.stdout)
`;

async function connectLists() {
  const out = {};
  for (const [mic, url] of Object.entries(CONNECT)) {
    const { title, codes } = await withWorkbook(url, CONNECT_READER);
    if (!/eligible for both buy and sell/i.test(title)) throw new Error(`the HKEX ${mic} list is titled "${title}"`);
    if (codes.length < 1000) throw new Error(`the HKEX ${mic} list has ${codes.length} codes`);
    out[mic] = new Set(codes);
  }
  return out;
}

// ---- 3-4. London ---------------------------------------------------------

const LSE_HEADERS = { Accept: "application/json", Origin: "https://www.londonstockexchange.com", Referer: "https://www.londonstockexchange.com/" };
const LINE_CURRENCIES = /(GBP|GBX|USD|EUR|CHF|JPY|HKD|SGD|AUD|CAD|SEK|NOK|DKK|PLN|ILS|ZAR)$/;

const EXPLORER = "https://api.londonstockexchange.com/api/v1/pages?path=live-markets/market-data-dashboard/price-explorer&parameters=";

async function explorer(parameters) {
  const page = await get(EXPLORER + encodeURIComponent(parameters), { headers: LSE_HEADERS, as: "json" });
  const block = (page?.components || []).flatMap((component) => component.content || []).find((item) => item.name === "priceexplorersearch")?.value;
  if (!block || !Array.isArray(block.content)) throw new Error(`the LSE price explorer answered no list for ${parameters}`);
  return block;
}

// Every equity and ETP line of the price explorer (about 11,000, 1,000 a
// page): TIDM, ISIN, currency and mid price.
async function lseExplorer() {
  const lines = [];
  let total = null;
  for (let number = 0; number < 40; number += 1) {
    const block = await explorer(`categories=EQUITY,ETFS&size=1000&page=${number}`);
    total ??= block.totalElements;
    lines.push(...block.content);
    if (block.content.length < 1000 || lines.length >= total) break;
    await sleep(2000);
  }
  if (lines.length !== total || lines.length < 8000) throw new Error(`the LSE price explorer has ${lines.length} of ${total} lines`);
  return lines;
}

async function lseIob() {
  const block = await explorer("subcategories=2&size=100");
  const lines = block.content;
  if (lines.length !== block.totalElements || lines.length < 30) throw new Error(`the LSE IOB list has ${lines.length} of ${block.totalElements} lines`);
  return { tidms: new Set(lines.map((line) => line.tidm)), isins: new Set(lines.map((line) => line.isin)) };
}

// The price-explorer line of a row: its TIDM, or the TIDM without IBKR's
// trailing dot or currency suffix (ABTCGBP -> ABTC), with the row's ISIN;
// else the row's ISIN in the row's currency.
function explorerLineOf(row, byTidm, byIsin) {
  const ticker = normalize(row.ticker).toUpperCase().replace(/\.$/, "");
  const tries = [ticker];
  const suffix = ticker.match(LINE_CURRENCIES);
  if (suffix && ticker.length > suffix[0].length + 1) tries.push(ticker.slice(0, -suffix[0].length));
  for (const tidm of tries) {
    const line = byTidm.get(tidm);
    if (line && (!row.isin || line.isin === row.isin)) return line;
  }
  return (byIsin.get(row.isin) || []).find((line) => line.currency === row.currency || (line.currency === "GBX" && row.currency === "GBP")) || null;
}

// ---- 5. ASX --------------------------------------------------------------

const ETP_READER = `
import json, sys, openpyxl
book = openpyxl.load_workbook(sys.argv[1], read_only=True)
sheet = book["Spotlight ETP List"]
sheet.reset_dimensions()
out = {}
for row in sheet.iter_rows(values_only=True):
    if not row or len(row) < 3:
        continue
    code = str(row[1] or "").strip().upper()
    kind = str(row[2] or "").strip()
    if code and kind and code.isalnum() and len(code) <= 6:
        out[code] = kind
json.dump(out, sys.stdout)
`;

async function asxLists() {
  const csv = await get(ASX_COMPANIES);
  if (!/^ASX listed companies as at/i.test(csv.trim())) throw new Error("the ASX company list has an unexpected heading");
  const companies = new Set();
  for (const line of csv.split(/\r?\n/)) {
    const code = line.match(/^"(?:[^"]|"")*","([A-Z0-9]{3,6})"/)?.[1];
    if (code) companies.add(code);
  }
  if (companies.size < 1500) throw new Error(`the ASX company list has ${companies.size} codes`);
  const page = await get(ASX_PRODUCTS);
  let best = null;
  for (const match of page.matchAll(/\/content\/dam\/asx\/issuers\/asx-investment-products-reports\/(\d{4})\/excel\/asx-investment-products-([a-z]+)-\d{4}-abs\.xlsx/g)) {
    const month = MONTH[match[2].slice(0, 3)];
    if (!month) continue;
    const rank = Number(match[1]) * 12 + month;
    if (!best || rank > best.rank) best = { rank, url: `https://www.asx.com.au${match[0]}` };
  }
  if (!best) throw new Error("the ASX investment-products page links no workbook");
  const kinds = await withWorkbook(best.url, ETP_READER);
  const products = new Set(Object.entries(kinds).filter(([, kind]) => ASX_ETP_KEEP.has(kind)).map(([code]) => code));
  if (products.size < 400) throw new Error(`the ASX ETP list has ${products.size} codes`);
  return { companies, products };
}

// "" when the ASX files the code as an ordinary security or a quoted ETP,
// else why it goes.
async function asxVerdict(code) {
  const header = (await get(`${ASX_API}${encodeURIComponent(code)}/header`, { headers: { Accept: "application/json" }, as: "json", notFound: true }))?.data;
  if (!header?.symbol) return "ASX: not quoted";
  if (ASX_ETP_TYPES.has(header.securityType)) return "";
  if (header.securityType !== 1) return `ASX: ${ASX_OTHER_TYPES[header.securityType] || `securityType ${header.securityType}`}`;
  const stats = (await get(`${ASX_API}${encodeURIComponent(code)}/key-statistics`, { headers: { Accept: "application/json" }, as: "json", notFound: true }))?.data;
  if (/deferred/i.test(stats?.shareDescription || "")) return "ASX: deferred-settlement line";
  return "";
}

// ---- 6. US tape ----------------------------------------------------------

// nasdaqtrader.com answers Node's fetch with a bot-check page; curl gets the
// file, from the FTP mirror first (as brokers/stakenz does), then HTTPS.
function directoryFile(file, header) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const url of [`ftp://ftp.nasdaqtrader.com/symboldirectory/${file}`, `https://www.nasdaqtrader.com/dynamic/SymDir/${file}`]) {
      try {
        const body = execFileSync("curl", ["-s", "--max-time", "120", "-A", "Mozilla/5.0", url], { maxBuffer: 64 << 20 }).toString("utf8");
        if (header.test(body)) return body;
        last = `${url} answered something else`;
      } catch (error) {
        last = String(error.message || error);
      }
    }
    spawnSync("sleep", [String(3 * (attempt + 1))]);
  }
  throw new Error(last);
}

const usKey = (symbol) => normalize(symbol).toUpperCase().replace(/\$/g, "PR").replace(/[^A-Z0-9]/g, "");

async function usDirectory() {
  const [nasdaq, other] = [directoryFile("nasdaqlisted.txt", /^Symbol\|/), directoryFile("otherlisted.txt", /^ACT Symbol\|/)];
  if (!/^Symbol\|Security Name\|Market Category\|Test Issue/.test(nasdaq) || !/^ACT Symbol\|Security Name\|Exchange\|CQS Symbol\|ETF\|Round Lot Size\|Test Issue\|NASDAQ Symbol/.test(other)) throw new Error("a Nasdaq Trader directory has an unexpected header");
  const listed = new Set();
  for (const line of nasdaq.split(/\r?\n/).slice(1)) {
    const cells = line.split("|");
    if (cells.length < 8 || cells[3] !== "N") continue;
    listed.add(usKey(cells[0]));
  }
  for (const line of other.split(/\r?\n/).slice(1)) {
    const cells = line.split("|");
    if (cells.length < 8 || cells[6] !== "N") continue;
    listed.add(usKey(cells[0]));
    listed.add(usKey(cells[3]));
    listed.add(usKey(cells[7]));
  }
  listed.delete("");
  if (listed.size < 9000) throw new Error(`the Nasdaq Trader directories have ${listed.size} symbols`);
  return listed;
}

// ---- 7. Hong Kong --------------------------------------------------------

const HKEX_READER = `
import json, sys, openpyxl
book = openpyxl.load_workbook(sys.argv[1], read_only=True)
sheet = book.worksheets[0]
sheet.reset_dimensions()
codes = []
for row in sheet.iter_rows(values_only=True):
    if row and row[0] is not None and str(row[0]).strip().isdigit():
        codes.append(str(row[0]).strip().zfill(5))
json.dump(codes, sys.stdout)
`;

async function hkexCodes() {
  const codes = new Set(await withWorkbook(HKEX, HKEX_READER));
  if (codes.size < 5000) throw new Error(`the HKEX list of securities has ${codes.size} codes`);
  return codes;
}

// ---- the pass ------------------------------------------------------------

// Drops, in place, the rows the rules above leave out, and returns
// rule -> { count, examples }.
export async function pruneByExchangeLists(rows) {
  const dropped = new Map();
  const out = new Map();
  const drop = (row, reason) => {
    out.set(row, reason);
    const entry = dropped.get(reason) || { count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 8) entry.examples.push(`${row.ticker} ${row.name}`.slice(0, 48));
    dropped.set(reason, entry);
  };
  const notes = [];

  const otc = rows.filter((row) => row.mic === "OTCM");
  if (otc.length) {
    const [microcaps, barred] = [await ibkrMicrocaps(), await otcBarred()];
    let notMicro = 0;
    for (const row of otc) {
      const label = barred.get(normalize(row.ticker).toUpperCase());
      if (!label) continue;
      if (label === "Expert Market") {
        drop(row, "OTC Expert Market (no market data for IBKR clients)");
        continue;
      }
      const conid = row.raw.match(/conid (\d+)/)?.[1];
      if (conid && microcaps.has(conid)) drop(row, `OTC ${label} (IBKR: no opening orders)`);
      else notMicro += 1;
    }
    if (notMicro) notes.push(`${notMicro} OTC Grey/Caveat Emptor rows kept: not on IBKR's U.S. Microcap list`);
  }

  const connect = rows.filter((row) => row.mic === "XSHG" || row.mic === "XSHE");
  if (connect.length) {
    const lists = await connectLists();
    for (const row of connect) if (!lists[row.mic].has(normalize(row.ticker).padStart(6, "0"))) drop(row, "Stock Connect sell-only (not on HKEX buy-and-sell list)");
  }

  const london = rows.filter((row) => row.mic === "XLON");
  if (london.length) {
    const iob = london.some((row) => row.exchange === "London IOB") ? await lseIob() : null;
    const lines = await lseExplorer();
    const byTidm = new Map(lines.map((line) => [line.tidm, line]));
    const byIsin = new Map();
    for (const line of lines) byIsin.set(line.isin, [...(byIsin.get(line.isin) || []), line]);
    // A line quoted with a mid price (bid and offer) is trading; only the
    // others are asked for their status, one by one and slowly (the LSE
    // API blocks a burst for several minutes).
    const unquoted = [];
    for (const row of london) {
      if (row.exchange === "London IOB" && !iob.tidms.has(normalize(row.ticker).replace(/\.$/, "")) && !iob.isins.has(row.isin)) {
        drop(row, "London IOB: no longer on the LSE IOB list");
        continue;
      }
      const line = explorerLineOf(row, byTidm, byIsin);
      if (!line || line.midPrice == null) unquoted.push([row, line?.tidm]);
    }
    if (unquoted.length > 800) throw new Error(`${unquoted.length} London lines have no mid price: the price explorer changed`);
    let unanswered = 0;
    for (const [row, tidm] of unquoted) {
      const candidates = [...new Set([tidm, normalize(row.ticker).toUpperCase().replace(/\.$/, "")].filter((code) => code && /^[A-Z0-9.]{1,10}$/.test(code)))];
      let found = null;
      for (const code of candidates) {
        const data = await get(LSE_LINE + encodeURIComponent(code), { headers: LSE_HEADERS, as: "json", notFound: true });
        await sleep(400);
        if (data && (!row.isin || data.isin === row.isin)) {
          found = data;
          break;
        }
      }
      if (!found) unanswered += 1;
      else if (String(found.tradingstatus || "").toUpperCase() === "S") drop(row, "LSE: suspended (trading status S)");
    }
    notes.push(`London: ${london.length - unquoted.length} lines quoted with a mid price, ${unquoted.length} asked for their status`);
    if (unanswered) notes.push(`${unanswered} London rows kept: the LSE API has no line for their TIDM and ISIN`);
  }

  const asx = rows.filter((row) => row.mic === "XASX");
  if (asx.length) {
    const { companies, products } = await asxLists();
    const unlisted = [];
    for (const row of asx) {
      const code = normalize(row.ticker).toUpperCase().replace(/\.\d+$/, "");
      if (!companies.has(code) && !products.has(code)) unlisted.push([row, code]);
    }
    const verdicts = new Map();
    await pool([...new Set(unlisted.map(([, code]) => code))], 2, async (code) => {
      verdicts.set(code, await asxVerdict(code));
      await sleep(250);
    });
    for (const [row, code] of unlisted) if (verdicts.get(code)) drop(row, verdicts.get(code));
  }

  const us = rows.filter((row) => US_MICS.has(row.mic));
  if (us.length) {
    const listed = await usDirectory();
    for (const row of us) if (!listed.has(usKey(row.ticker))) drop(row, "US: not in the Nasdaq Trader symbol directory");
  }

  const hk = rows.filter((row) => row.mic === "XHKG");
  if (hk.length) {
    const codes = await hkexCodes();
    for (const row of hk) if (!codes.has(normalize(row.ticker).padStart(5, "0"))) drop(row, "HK: not on the HKEX list of securities");
  }

  if (out.size) {
    let at = 0;
    for (const row of rows) if (!out.has(row)) rows[at++] = row;
    rows.length = at;
  }
  return { dropped, notes };
}

export function reportPruned({ dropped, notes }) {
  for (const [reason, { count, examples }] of [...dropped].sort((left, right) => right[1].count - left[1].count)) {
    console.error(`dropped ${count} ${reason}: ${examples.join("; ")}`);
  }
  for (const note of notes) console.error(note);
}
