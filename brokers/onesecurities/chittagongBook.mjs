// The Chittagong Stock Exchange book, for the Bangladeshi brokers that hold
// a CSE trading right (TREC) as well as, or instead of, a Dhaka one. A CSE
// member sends every order to the exchange's one trading system, so the
// book is every line the exchange lists and lets trade today.
//
// Sources, all public, no login:
// - The company directory: the search box of the listed-companies page
//   carries every code with its name and its board (Main, SME, ATB).
//     https://www.cse.com.bd/company/listedcompanies
// - The page of each company gives the sector, the market category, the
//   type of instrument, the last trade (price, date, trades today) and the
//   52-week range. SME lines have their own page.
//     https://www.cse.com.bd/company/companydetails/GP
//     https://www.cse.com.bd/sme/companydetails/KBSEED
// - The CSE prints no ISIN. A line takes the ISIN of the same code in the
//   Dhaka book (../mika/dseBook.mjs: DSE company page, else
//   assets/stocks.csv), else of the Dhaka line with the same company name,
//   else the one CDBL, the depository, files under that name.
//     https://api.cdbl.com.bd/v1/public/isin
//
// Kept: the Main board (shares; the closed-end mutual funds as FUND) and
// the SME board (STOCK; open only to qualified investors under the BSEC
// SME rules, a client condition: a remark, not a removal; their raw text
// ends with "| CSE SME board"). No ETF is listed in Bangladesh; a line
// named ETF would get type ETF.
// Left out:
// - Debt: the CORPORATE BOND, TREASURY BOND and DEBENTURE sectors, and any
//   line whose instrument or name says bond, sukuk or debenture.
// - The Alternative Trading Board (unlisted and delisted securities).
// - A halted line. The CSE marks none in its directory, but the page of a
//   halted line answers HTTP 500 or prints no market data (in October 2026
//   the banks declared non-viable on 5 November 2025: EXIMBANK, FIRSTSBANK,
//   GIB...). Also left out: a line the Dhaka book finds suspended (both
//   exchanges halt a company on the same BSEC order or company notice), and
//   a line with no trade on the CSE in 52 weeks (no 52-week range). A few
//   live lines fail the same way (KAY&QUE, whose DSE page also fails); the
//   run names every one.
// - A line with no ISIN anywhere (reported).
// Kept and named in the run: lines that did not trade in the last session
// (the CSE is thin: most days a third of the board does not trade).
//
// Every line trades in taka (BDT) on one venue, XCHG. The per-company crawl
// (about 400 pages, one every ~0.7 s) is kept in cse-cache.json next to
// this file for 12 hours, so the scrapers run back to back read the
// exchange once.
//
// Use:
//   import { writeBangladeshCatalogue } from "../onesecurities/chittagongBook.mjs";
//   await writeBangladeshCatalogue(import.meta.url, "x-parsed.json", {
//     places: ["DSE", "CSE"],                  // or ["DSE"], ["CSE"]
//     evidence: [{ url, patterns: [/.../] }],  // broker sentences checked first
//   });
//   // or: const { listed, suspended, leftOut, untraded } = await chittagongBook();
//
//   node brokers/onesecurities/chittagongBook.mjs   (prints the counts, writes only the cache)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { dseBook } from "../mika/dseBook.mjs";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const EXCHANGE = "Chittagong Stock Exchange";
export const MIC = "XCHG";
const CSE = "https://www.cse.com.bd";
const CDBL_ISIN = "https://api.cdbl.com.bd/v1/public/isin";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CACHE = new URL("cse-cache.json", import.meta.url);
const CACHE_HOURS = 12;
const PAUSE_MS = 700;
const DEBT_SECTOR = /^(corporate bond|treasury bond|debenture|g-?sec|government securit)/i;
const DEBT_NAME = /\b(bonds?|sukuk|debentures?)\b/i;
const NON_VIABLE = ["EXIMBANK", "FIRSTSBANK", "GIB", "SIBL", "UNIONBANK"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// curl, not fetch: several Bangladeshi servers do not send their
// intermediate certificate, which Node rejects and curl completes from the
// system store.
async function get(url, accept = "text/html") {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        "curl",
        ["-fsSL", "--compressed", "--max-time", "60", "-A", UA, "-H", `Accept: ${accept}`, url],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      if (stdout.length > 100) return stdout;
      last = `empty answer ${url}`;
    } catch (error) {
      last = `${String(error.stderr || error.message || error).trim()} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// The search box: <option value='GP|Main'>GP | GRAMEENPHONE LIMITED</option>
function directory(html) {
  const codes = {};
  for (const match of html.matchAll(/<option value='([^'|]+)\|([^']+)'>([^<]*)<\/option>/g)) {
    const code = clean(match[1]);
    const board = clean(match[2]);
    const name = clean(match[3]).replace(/^.*?\|\s*/, "");
    if (!codes[code]) codes[code] = { code, board, name };
  }
  return codes;
}

function pageLines(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<option[\s\S]*?<\/option>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return body
    .split(/<[^>]+>/)
    .map(clean)
    .filter(Boolean);
}

function number(text) {
  const value = Number(String(text || "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
}

// Label / value pairs of a company page, read as consecutive text cells.
function companyRecord(code, html) {
  const lines = pageLines(html);
  const at = lines.indexOf("Trading Code:");
  if (at < 0 || lines[at + 1] !== code) throw new Error(`${code}: the CSE page names ${lines[at + 1] || "no code"}`);
  const value = (label) => {
    const index = lines.indexOf(label, at);
    return index < 0 ? "" : lines[index + 1] || "";
  };
  const ltp = value("Last Trade Price (LTP)");
  const range = value("52 Week's Range").match(/^([\d,.]+)\s*-\s*([\d,.]+)$/);
  const sector = value("Sector");
  return {
    code,
    // A suspended line prints its name and code and nothing after "Change".
    market: /^[\d,.]+$/.test(ltp),
    ltp: number(ltp),
    lastTrade: value("Last Trade Date") || value("Updated Date"),
    trades: number(value("Total Trade")),
    sector: /^(Market Category|Other Information)$/.test(sector) ? "" : sector,
    category: value("Market Category").replace(/^Other Information$/, ""),
    instrument: value("Type of Instrument").replace(/^52 Week's Range$/, ""),
    weekLow52: range ? number(range[1]) : 0,
    weekHigh52: range ? number(range[2]) : 0,
  };
}

function nameKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(limited|ltd|plc|public limited company|company|co)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  } catch {
    return null;
  }
}

function fresh(at) {
  return Date.now() - Date.parse(at || 0) < CACHE_HOURS * 3600_000;
}

// A finished crawl is reused whole for 12 hours; a crawl that stopped half
// way goes on from the pages it read in the last 12 hours.
async function crawl() {
  const kept = readCache();
  if (kept?.done && fresh(kept.fetchedAt)) return { ...kept, fromCache: true };
  const pages = {};
  for (const [code, page] of Object.entries(kept?.pages || {})) if (fresh(page.at)) pages[code] = page;
  const companies = directory(await get(`${CSE}/company/listedcompanies`));
  const traded = Object.values(companies).filter((record) => record.board === "Main" || record.board === "SME");
  if (traded.length < 350) throw new Error(`the CSE directory has ${traded.length} Main and SME lines`);
  let fetched = 0;
  for (const record of traded) {
    if (pages[record.code]) continue;
    await sleep(PAUSE_MS);
    const path = record.board === "SME" ? "sme/companydetails" : "company/companydetails";
    // The page of a halted line answers HTTP 500 every time: the line is
    // named in the run and left out.
    let page;
    try {
      page = companyRecord(record.code, await get(`${CSE}/${path}/${encodeURIComponent(record.code)}`));
    } catch (error) {
      if (!/error: 5\d\d/.test(error.message)) throw error;
      page = { code: record.code, broken: error.message.slice(0, 160) };
    }
    pages[record.code] = { ...page, at: new Date().toISOString() };
    fetched += 1;
    if (fetched % 25 === 0) fs.writeFileSync(CACHE, JSON.stringify({ done: false, pages }));
  }
  fs.writeFileSync(CACHE, JSON.stringify({ done: false, pages }));
  let isins = kept?.isins;
  if (!isins || !fresh(kept?.fetchedAt)) {
    const cdbl = JSON.parse(await get(CDBL_ISIN, "application/json"));
    if (!cdbl?.success || !Array.isArray(cdbl.data) || cdbl.data.length < 500) throw new Error("the CDBL ISIN list is short");
    isins = cdbl.data.map((item) => ({ isin: item.isin, name: clean(item.isin_name), type: item.security_type }));
  }
  const result = { done: true, fetchedAt: new Date().toISOString(), companies, pages, isins };
  fs.writeFileSync(CACHE, JSON.stringify(result));
  return { ...result, fromCache: false };
}

function typeOf(name, sector) {
  if (/\bETF\b|exchange traded fund/i.test(name)) return "ETF";
  if (/^mutual fund/i.test(sector)) return "FUND";
  return "STOCK";
}

// Every CSE line open to trade, as catalogue rows (exchange "Chittagong
// Stock Exchange", mic XCHG, BDT), sorted by type then ticker; plus the
// codes left out and why. `dse` is a dseBook() result, read when absent.
export async function chittagongBook({ sme = true, dse = null } = {}) {
  const { companies, pages, isins, fetchedAt, fromCache } = await crawl();
  const dhaka = dse || (await dseBook());
  const dseByCode = new Map(dhaka.listed.map((row) => [row.ticker, row]));
  const dseByName = new Map();
  for (const row of dhaka.listed) {
    const key = nameKey(row.name);
    dseByName.set(key, dseByName.has(key) ? null : row);
  }
  const dseSuspended = new Map(dhaka.suspended.map((line) => [line.code, line]));
  const cdblByName = new Map();
  for (const item of isins) {
    const key = nameKey(item.name);
    if (!cdblByName.has(key)) cdblByName.set(key, []);
    cdblByName.get(key).push(item.isin);
  }

  const listed = [];
  const suspended = [];
  const leftOut = [];
  const untraded = [];
  const boards = {};
  let debt = 0;
  for (const record of Object.values(companies)) {
    boards[record.board] = (boards[record.board] || 0) + 1;
    if (record.board !== "Main" && !(sme && record.board === "SME")) continue;
    const page = pages[record.code];
    if (!page) throw new Error(`${record.code}: no page in the crawl`);
    const name = record.name;
    if (page.broken) {
      suspended.push({ code: record.code, why: `its CSE page answers ${page.broken.match(/error: (\d+)/)?.[1] || "an error"}` });
      continue;
    }
    if (DEBT_SECTOR.test(page.sector) || DEBT_NAME.test(page.instrument) || DEBT_NAME.test(name)) {
      debt += 1;
      continue;
    }
    if (!page.market) {
      suspended.push({ code: record.code, why: "no market data on its CSE page" });
      continue;
    }
    if (dseSuspended.has(record.code)) {
      const line = dseSuspended.get(record.code);
      suspended.push({ code: record.code, why: `suspended on the DSE (${line.date})` });
      continue;
    }
    if (!page.weekHigh52) {
      leftOut.push(`${record.code} no CSE trade in 52 weeks`);
      continue;
    }
    const twin = dseByCode.get(record.code) || dseByName.get(nameKey(name)) || null;
    const matches = cdblByName.get(nameKey(name)) || [];
    const isin = twin?.isin || (matches.length === 1 ? matches[0] : "");
    if (!isin) {
      leftOut.push(`${record.code} no ISIN${matches.length > 1 ? ` (CDBL files ${matches.length} under "${name}")` : ""}`);
      continue;
    }
    if (!page.trades) untraded.push(record.code);
    const board = record.board === "SME" ? "CSE SME board" : "";
    listed.push({
      query: isin,
      ticker: record.code,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "BDT",
      type: typeOf(name, page.sector),
      isin,
      raw: [record.code, name, page.sector, page.category && `category ${page.category}`, page.instrument, isin, board]
        .filter(Boolean)
        .join(" | "),
    });
  }

  const seen = new Set();
  for (const row of listed) {
    if (seen.has(row.ticker)) throw new Error(`${row.ticker} is listed twice`);
    seen.add(row.ticker);
  }
  listed.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));

  for (const ticker of ["GP", "SQURPHARMA", "BRACBANK", "BATBC", "BEXIMCO"]) {
    if (!listed.some((row) => row.ticker === ticker && row.type === "STOCK")) throw new Error(`${ticker} missing from the CSE book`);
  }
  for (const ticker of NON_VIABLE) {
    if (listed.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is suspended and was kept`);
  }
  const count = (type) => listed.filter((row) => row.type === type).length;
  if (count("STOCK") < 250) throw new Error(`only ${count("STOCK")} CSE shares`);
  if (count("FUND") < 15) throw new Error(`only ${count("FUND")} CSE mutual funds`);
  if (suspended.length > 40) throw new Error(`${suspended.length} CSE lines read as suspended`);
  if (leftOut.length > 30) throw new Error(`${leftOut.length} CSE lines left out: ${leftOut.join(", ")}`);
  return { listed, suspended, leftOut, untraded, debt, boards, fetchedAt, fromCache, dse: dhaka };
}

// Reads a broker page with curl and stops the run when a sentence the
// catalogue rests on is gone.
export async function brokerSays(url, patterns) {
  const html = await get(url);
  const text = clean(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")).replace(/[’‘]/g, "'");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  return text;
}

// Writes <file> next to the calling scraper: the DSE book, the CSE book or
// both (a title listed on both gets one row per place, same ISIN).
// `types` keeps only those row types; `sme: false` drops both SME boards;
// `evidence` is checked before anything is read from the exchanges.
export async function writeBangladeshCatalogue(here, file, { places = ["DSE"], types = ["STOCK", "ETF", "FUND"], sme = true, evidence = [] } = {}) {
  for (const { url, patterns } of evidence) await brokerSays(url, patterns);
  const dse = await dseBook({ sme });
  const rows = [];
  if (places.includes("DSE")) rows.push(...dse.listed);
  let cse = null;
  if (places.includes("CSE")) {
    cse = await chittagongBook({ sme, dse });
    rows.push(...cse.listed);
  }
  const kept = stampRows(withoutObligations(rows.filter((row) => types.includes(row.type)).map((row) => ({ ...row }))));
  for (const row of kept) if (row.isin) row.query = row.isin;
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const counts = {};
  for (const row of kept) {
    const place = row.mic === MIC ? "CSE" : "DSE";
    const key = `${place} ${row.type}${/SME board$/.test(row.raw) ? " (SME)" : ""}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.error(`${kept.length} rows ${JSON.stringify(counts)}; DSE data of ${dse.fetchedAt}${cse ? `, CSE data of ${cse.fetchedAt}` : ""}`);
  console.error(`DSE suspended left out: ${dse.suspended.map((line) => line.code).join(" ")}`);
  if (cse) report(cse);
  return kept;
}

function report(book) {
  const counts = {};
  for (const row of book.listed) {
    const key = row.raw.endsWith("CSE SME board") ? `${row.type} (SME)` : row.type;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.error(
    `${book.listed.length} CSE lines ${JSON.stringify(counts)}${book.fromCache ? " (read from cse-cache.json)" : ""}, ` +
      `${book.debt} debt lines left out, exchange data of ${book.fetchedAt}`,
  );
  console.error(`CSE suspended left out: ${book.suspended.map((line) => `${line.code} (${line.why})`).join(", ")}`);
  if (book.leftOut.length) console.error(`CSE left out: ${book.leftOut.join(", ")}`);
  if (book.untraded.length) console.error(`CSE kept, no trade last session: ${book.untraded.length} lines`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const book = await chittagongBook();
  report(book);
  console.error("directory boards:", book.boards);
}
