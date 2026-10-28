// The Dhaka Stock Exchange book, for the Bangladeshi brokers whose only
// place is the DSE and which print no list of their own (Mika, Bank Asia
// Securities, Sheltech, AB & Co., Mondol, Uniroyal uTrade). A DSE member
// sends every order to the exchange's one trading system, so the book is
// every line the exchange lists and lets trade today.
//
// Sources, all public, no login:
// - The company directory prints every listed code with its name, sector,
//   board (PUBLIC, DEBT, YIELDDBT) and category (A, B, N, Z).
//     https://www.dse.com.bd/companies
// - The page of each company gives the ISIN, the instrument type, whether
//   the line traded in the last session, the 52-week range, and the last
//   40 announcements, where the exchange posts "Suspension of Trading".
//     https://www.dse.com.bd/company/GP
// - The SME board is not on the new site yet ("The SME Board screener will
//   be available in a later release", https://www.dse.com.bd/sme). Its old
//   site still prints the board's price list and each company's page.
//     https://sme.dsebd.org/sme_latest_share_price_scroll_l.php
//     https://sme.dsebd.org/sme_displayCompany.php?name=KBSEED
// - The SME pages give no ISIN. CDBL, the depository, prints every ISIN it
//   holds with the issuer's name, so an SME line takes the ISIN filed under
//   its company's name there (a main-board line takes the ISIN on its DSE
//   page, else the one assets/stocks.csv or etfs.csv file under DSEBD).
//     https://www.cdbl.com.bd/list-of-isin  (data: https://api.cdbl.com.bd/v1/public/isin)
//
// Kept: the PUBLIC board (shares and the closed-end mutual funds, which are
// listed and traded like shares; type FUND) and the SME board (STOCK).
// The DSE says "No exchange-traded funds or open-end mutual funds are
// listed on the DSE at present" (https://www.dse.com.bd/funds), so there is
// no ETF today; a line named ETF would get type ETF.
// Left out:
// - The DEBT board (debentures, perpetual and subordinated bonds, sukuk)
//   and the YIELDDBT board (treasury bonds): debt.
// - The Alternative Trading Board, which the DSE describes as "unlisted and
//   delisted securities" (https://www.dse.com.bd/atb).
// - A suspended line: one whose latest open-ended suspension notice
//   ("shall remain suspended ... until further notice", "with effect from",
//   an exit plan, a delisting) has no later resumption notice, and which
//   did not trade in the last session. In October 2026 these are the five
//   banks declared non-viable on 5 November 2025 (EXIMBANK, FIRSTSBANK,
//   GIB, SIBL, UNIONBANK), the finance companies put under resolution in
//   2026, Savar Refractories (exit plan, May 2023) and funds suspended
//   pending a meeting. A suspension "on record date" only is a one-day halt
//   and does not count. A line whose notices give its "last day of trading"
//   or say it is wound up or under liquidation is treated the same way
//   (Vanguard AML BD Finance Mutual Fund One, wound up after its last
//   trading day, 22 December 2025, still sits in the directory).
// - A line with no trade in 52 weeks (no 52-week range): never traded or
//   dead.
// - A line with no ISIN anywhere (reported; none today on the main board).
// Kept but worth a look by a broker: category Z lines (they trade, with
// T+3 settlement and no margin), lines of companies the DSE lists as closed
// or non-operational (https://www.dse.com.bd/companies/closed; their pages
// say "Closed" or "Operation Shutdown", 37 in October 2026, and they still
// trade), and lines that simply did not trade in the last session. The
// site fails to render a few company pages (KAY&QUE in October 2026); such
// a line keeps its directory entry and takes its ISIN from the shared lists
// or from CDBL by name, and the run names it. SME
// lines are open only to qualified investors under the BSEC rules for the
// SME platform (a client condition: a remark, not a removal); their raw
// text ends with "| DSE SME board" so a scraper can tell them apart.
//
// Every line trades in taka (BDT) on one venue, XDHA. The per-company crawl
// (about 400 pages, one every ~0.7 s) is kept in dse-cache.json next to
// this file for 12 hours, so the six scrapers run back to back read the
// exchange once.
//
// Use:
//   import { writeDseCatalogue } from "../mika/dseBook.mjs";
//   await writeDseCatalogue(import.meta.url, "mika-parsed.json");
//   // options: { types: ["STOCK", "ETF", "FUND"], sme: true }
//   // or: const { listed, suspended, leftOut, untraded } = await dseBook();
//
//   node brokers/mika/dseBook.mjs     (prints the counts, writes nothing but the cache)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const EXCHANGE = "Dhaka Stock Exchange";
export const MIC = "XDHA";
const DSE = "https://www.dse.com.bd";
const SME = "https://sme.dsebd.org";
const CDBL_ISIN = "https://api.cdbl.com.bd/v1/public/isin";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CACHE = new URL("dse-cache.json", import.meta.url);
const CACHE_HOURS = 12;
const PAUSE_MS = 700;

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

// curl, not fetch: the SME server does not send its intermediate
// certificate, which Node rejects and curl completes from the system store.
async function get(url, accept = "text/html") {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        "curl",
        ["-fsSL", "--compressed", "--max-time", "30", "-A", UA, "-H", `Accept: ${accept}`, url],
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

// The new DSE site is a Next.js app: the page data rides in
// self.__next_f.push([1,"..."]) chunks, JSON-escaped.
function flightData(html) {
  let text = "";
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    text += JSON.parse(`"${match[1]}"`);
  }
  if (!text) throw new Error("no page data in the DSE page");
  return text;
}

function directory(html) {
  const text = flightData(html);
  const codes = new Map();
  for (const match of text.matchAll(/\{"code":"[^"]+","name":"(?:[^"\\]|\\.)*","sector":[^{}]*\}/g)) {
    const record = JSON.parse(match[0]);
    if (!codes.has(record.code)) codes.set(record.code, record);
  }
  return codes;
}

function companyRecord(code, html) {
  const text = flightData(html);
  const at = text.indexOf('"company":{"code":');
  // The site fails to render a few codes (KAY&QUE in October 2026): the
  // directory line then stands alone, with no ISIN, notice or 52-week range.
  if (at < 0) return { code, missing: true };
  const [company] = rawDecode(text, at + '"company":'.length);
  if (company.code !== code) throw new Error(`${code}: the page describes ${company.code}`);
  const news = Array.isArray(company.recentAnnouncements) ? company.recentAnnouncements : [];
  return {
    code,
    isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(company.isin || "") ? company.isin : "",
    instrumentType: company.instrumentType || "",
    operationalStatus: company.operationalStatus || "",
    otcStatus: company.otcStatus || "",
    traded: Boolean(company.sessionQuote?.traded),
    weekHigh52: Number(company.weekHigh52) || 0,
    weekLow52: Number(company.weekLow52) || 0,
    asOf: company.marketLastUpdate || company.lastPriceUpdate || "",
    // Only the notices the suspension test reads are kept in the cache.
    notices: news
      .map((item) => ({ date: item.date || "", text: clean(`${item.summary || ""}. ${item.body || ""}`).slice(0, 600) }))
      .filter((item) => NOTICE.test(item.text)),
  };
}

// JSON.parse of the one value that starts at `from`.
function rawDecode(text, from) {
  let depth = 0;
  let inString = false;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return [JSON.parse(text.slice(from, index + 1)), index + 1];
    }
  }
  throw new Error("unterminated value in the DSE page data");
}

const NOTICE = /suspen|delist|resum|commence|allowed to|lift|withdraw|revok|wound|winding|liquidation|last day/i;
const SUSPENDED = /suspen|delist/i;
const OPEN_ENDED = /until further notice|with effect from|exit plan|non-viable|delist/i;
// A fund at the end of its tenure, or a line being wound up, trades no more.
const ENDED = /last day of trading|proceeds on winding up|(?:is|was|been) wound up|\(under liquidation\)/i;
const RESUMED = /resum|re-?commence|allowed to (?:re)?trade|lift(?:ed|ing)? (?:of |the )?(?:the )?suspension|suspension (?:has been |is )?(?:lifted|withdrawn|revoked)|withdraw(?:al|n)? of (?:the )?suspension/i;

// Newest first: a resumption notice ends the search; an open-ended
// suspension notice is returned as { date, text }.
function openSuspension(notices) {
  const dated = notices
    .map((item) => ({ ...item, time: Date.parse(item.date) }))
    .sort((left, right) => (right.time || 0) - (left.time || 0));
  for (const item of dated) {
    if (ENDED.test(item.text)) return { date: item.date, text: item.text.slice(0, 300) };
    if (RESUMED.test(item.text) && !/remain suspended on record date/i.test(item.text)) return null;
    if (!SUSPENDED.test(item.text)) continue;
    const recordDayOnly = /suspended on (?:the )?record date/i.test(item.text) && !/until further notice/i.test(item.text);
    if (recordDayOnly) continue;
    if (OPEN_ENDED.test(item.text)) return { date: item.date, text: item.text.slice(0, 300) };
  }
  return null;
}

function smeCodes(html) {
  const codes = [];
  for (const match of html.matchAll(/sme_displayCompany\.php\?name=([^"&']+)/gi)) {
    const code = clean(decodeURIComponent(match[1])).toUpperCase();
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

function smeRecord(code, html) {
  const text = clean(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<!--|-->/g, " "));
  const name = text.match(/Company Name:\s*(.+?)\s+Trading Code:\s*(\S+)/);
  if (!name || name[2].toUpperCase() !== code) throw new Error(`${code}: the SME page names no company`);
  const range = text.match(/52 Weeks' Moving Range\s+([\d,.]+)\s*-\s*([\d,.]+)/);
  const trades = text.match(/Day's Trade \(Nos\.\)\s+([\d,.]+|-)/);
  return {
    code,
    name: name[1],
    instrumentType: text.match(/Type of Instrument\s+(\w[\w ]*?)\s+Face/)?.[1] || "",
    sector: text.match(/\bSector\s+(.+?)\s+Closing Price Graph/)?.[1] || "",
    weekLow52: range ? Number(range[1].replace(/,/g, "")) : 0,
    weekHigh52: range ? Number(range[2].replace(/,/g, "")) : 0,
    traded: Boolean(trades && trades[1] !== "-" && Number(trades[1].replace(/,/g, "")) > 0),
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

function listIsins() {
  const byCode = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const [code, place, isin] = line.split(",");
      if (place === "DSEBD" && /^BD[0-9A-Z]{10}$/.test(isin || "")) byCode.set(code.slice("DSEBD:".length), isin);
    }
  }
  return byCode;
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

// A finished crawl is reused whole for 12 hours. Otherwise each company
// page read in the last 12 hours is kept (pages are stamped with their
// time), so a run that stopped half way goes on from there. A page that
// did not render is read again, after a longer pause, up to three times.
async function crawl() {
  const kept = readCache();
  const whole = kept?.done && fresh(kept.fetchedAt) && !Object.values(kept.pages || {}).some((page) => page.missing && !page.confirmed);
  if (whole) return { ...kept, fromCache: true };
  const pages = {};
  for (const [code, page] of Object.entries(kept?.pages || {})) if (fresh(page.at) && !page.missing) pages[code] = page;
  const companies = Object.fromEntries(directory(await get(`${DSE}/companies`)));
  const publicCodes = Object.values(companies).filter((record) => record.board === "PUBLIC").map((record) => record.code);
  if (publicCodes.length < 350) throw new Error(`the DSE directory has ${publicCodes.length} PUBLIC lines`);
  let fetched = 0;
  for (const code of publicCodes) {
    if (pages[code]) continue;
    let page = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await sleep(PAUSE_MS * (1 + attempt * 6));
      page = companyRecord(code, await get(`${DSE}/company/${encodeURIComponent(code)}`));
      if (!page.missing) break;
    }
    // Three empty answers in a row: the site does not render this code.
    if (page.missing) page.confirmed = true;
    pages[code] = { ...page, at: new Date().toISOString() };
    fetched += 1;
    if (fetched % 25 === 0) fs.writeFileSync(CACHE, JSON.stringify({ done: false, pages }));
  }
  fs.writeFileSync(CACHE, JSON.stringify({ done: false, pages }));
  let sme = kept?.sme;
  let isins = kept?.isins;
  if (!sme || !isins || !fresh(kept?.fetchedAt)) {
    await sleep(PAUSE_MS);
    const smeList = await get(`${SME}/sme_latest_share_price_scroll_l.php`);
    sme = {};
    for (const code of smeCodes(smeList)) {
      await sleep(PAUSE_MS);
      sme[code] = smeRecord(code, await get(`${SME}/sme_displayCompany.php?name=${encodeURIComponent(code)}`));
    }
    await sleep(PAUSE_MS);
    const cdbl = JSON.parse(await get(CDBL_ISIN, "application/json"));
    if (!cdbl?.success || !Array.isArray(cdbl.data) || cdbl.data.length < 500) throw new Error("the CDBL ISIN list is short");
    isins = cdbl.data.map((item) => ({ isin: item.isin, name: clean(item.isin_name), type: item.security_type }));
  }
  const result = { done: true, fetchedAt: new Date().toISOString(), companies, pages, sme, isins };
  fs.writeFileSync(CACHE, JSON.stringify(result));
  return { ...result, fromCache: false };
}

function typeOf(name, sector) {
  if (/\bETF\b|exchange traded fund/i.test(name)) return "ETF";
  if (/^mut/i.test(sector)) return "FUND";
  return "STOCK";
}

// Every DSE line open to trade, as catalogue rows (exchange "Dhaka Stock
// Exchange", mic XDHA, BDT), sorted by type then ticker; plus the codes
// left out and why, and the kept codes that did not trade last session.
export async function dseBook({ sme = true } = {}) {
  const { companies, pages, sme: smePages, isins, fetchedAt, fromCache } = await crawl();
  const fromLists = listIsins();
  const cdblByName = new Map();
  const cdblIsins = new Set();
  for (const item of isins) {
    cdblIsins.add(item.isin);
    const key = nameKey(item.name);
    if (!cdblByName.has(key)) cdblByName.set(key, []);
    cdblByName.get(key).push(item.isin);
  }

  const listed = [];
  const suspended = [];
  const leftOut = [];
  const untraded = [];
  const noPage = [];
  const boards = {};
  for (const record of Object.values(companies)) {
    boards[record.board] = (boards[record.board] || 0) + 1;
    if (record.board !== "PUBLIC") continue;
    let page = pages[record.code];
    if (!page) throw new Error(`${record.code}: no page in the crawl`);
    if (page.missing) {
      noPage.push(record.code);
      const matches = cdblByName.get(nameKey(record.name)) || [];
      page = {
        isin: fromLists.get(record.code) || (matches.length === 1 ? matches[0] : ""),
        instrumentType: "",
        traded: Number(record.volume) > 0,
        weekHigh52: Number(record.price) || 0,
        notices: [],
      };
    }
    const suspension = openSuspension(page.notices || []);
    if (suspension && !page.traded) {
      suspended.push({ code: record.code, date: suspension.date, notice: suspension.text });
      continue;
    }
    if (!page.weekHigh52) {
      leftOut.push(`${record.code} no trade in 52 weeks`);
      continue;
    }
    const isin = page.isin || fromLists.get(record.code) || "";
    if (!isin) {
      leftOut.push(`${record.code} no ISIN`);
      continue;
    }
    if (!page.traded) untraded.push(record.code);
    const name = clean(record.name);
    const type = typeOf(name, record.sector);
    listed.push({
      query: isin,
      ticker: record.code,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "BDT",
      type,
      isin,
      raw: [record.code, name, record.sector, `category ${record.category}`, page.instrumentType, isin].join(" | "),
    });
  }

  if (sme) {
    for (const page of Object.values(smePages)) {
      if (!page.weekHigh52) {
        leftOut.push(`${page.code} (SME) no trade in 52 weeks`);
        continue;
      }
      const matches = cdblByName.get(nameKey(page.name)) || [];
      const isin = fromLists.get(page.code) || (matches.length === 1 ? matches[0] : "");
      if (!isin) {
        leftOut.push(`${page.code} (SME) no ISIN${matches.length > 1 ? ` (CDBL files ${matches.length} under "${page.name}")` : ""}`);
        continue;
      }
      if (!page.traded) untraded.push(page.code);
      listed.push({
        query: isin,
        ticker: page.code,
        name: page.name,
        exchange: EXCHANGE,
        mic: MIC,
        currency: "BDT",
        type: typeOf(page.name, page.sector),
        isin,
        raw: [page.code, page.name, page.sector, page.instrumentType, isin, "DSE SME board"].join(" | "),
      });
    }
  }

  const seen = new Set();
  for (const row of listed) {
    if (seen.has(row.ticker)) throw new Error(`${row.ticker} is listed twice`);
    seen.add(row.ticker);
  }
  listed.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));

  for (const ticker of ["GP", "SQURPHARMA", "BRACBANK", "BATBC", "BEXIMCO"]) {
    if (!listed.some((row) => row.ticker === ticker && row.type === "STOCK")) throw new Error(`${ticker} missing`);
  }
  for (const ticker of ["EXIMBANK", "FIRSTSBANK", "GIB", "SIBL", "UNIONBANK"]) {
    if (listed.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is suspended and was kept`);
  }
  const count = (type) => listed.filter((row) => row.type === type).length;
  if (count("STOCK") < 300) throw new Error(`only ${count("STOCK")} shares`);
  if (count("FUND") < 20) throw new Error(`only ${count("FUND")} mutual funds`);
  if (noPage.length > 10) throw new Error(`${noPage.length} DSE company pages did not render: ${noPage.join(" ")}`);
  if (suspended.length > 40) throw new Error(`${suspended.length} lines read as suspended`);
  if (leftOut.length > 25) throw new Error(`${leftOut.length} lines left out: ${leftOut.join(", ")}`);
  const unknownIsin = listed.filter((row) => !cdblIsins.has(row.isin)).map((row) => `${row.ticker} ${row.isin}`);
  return { listed, suspended, leftOut, untraded, noPage, unknownIsin, boards, fetchedAt, fromCache };
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types (a broker that does not sell the closed-end funds passes
// ["STOCK", "ETF"]); `sme: false` drops the SME board.
export async function writeDseCatalogue(here, file, { types = ["STOCK", "ETF", "FUND"], sme = true } = {}) {
  const book = await dseBook({ sme });
  const rows = book.listed.filter((row) => types.includes(row.type)).map((row) => ({ ...row }));
  const kept = stampRows(withoutObligations(rows));
  for (const row of kept) if (row.isin) row.query = row.isin;
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  report(book, kept);
  return kept;
}

function report(book, kept) {
  const counts = {};
  for (const row of kept) {
    const key = row.raw.endsWith("DSE SME board") ? `${row.type} (SME)` : row.type;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.error(
    `${kept.length} DSE lines ${JSON.stringify(counts)}${book.fromCache ? " (read from dse-cache.json)" : ""}, ` +
      `exchange data of ${book.fetchedAt}`,
  );
  console.error(`${book.suspended.length} suspended left out: ${book.suspended.map((line) => `${line.code} (${line.date})`).join(", ")}`);
  if (book.leftOut.length) console.error(`left out: ${book.leftOut.join(", ")}`);
  if (book.untraded.length) console.error(`kept, no trade last session: ${book.untraded.join(" ")}`);
  if (book.noPage.length) console.error(`no DSE company page (directory line and CDBL ISIN used): ${book.noPage.join(" ")}`);
  if (book.unknownIsin.length) console.error(`ISIN not in the CDBL list: ${book.unknownIsin.join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const book = await dseBook();
  report(book, book.listed);
  console.error("directory boards:", book.boards);
}
