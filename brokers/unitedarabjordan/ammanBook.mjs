// The Amman Stock Exchange book, for the brokers whose one place is the ASE
// and that sell all of it (United Arab Jordan Company / AJIB, Excel for
// Financial Investment). The exchange's own list of listed shares (first
// and second market) is one table: name, short name, symbol, ASE code,
// market, listed shares, status, notes. A delisted company leaves this
// table; the third market (OTC, "unlisted securities") is not in it.
//
//   https://www.exchange.jo/en/products-services/securties-types/shares
//
// The ASE has no ETF, fund or depository receipt listed: "No Investment
// Fund listed yet." and "No deposit receipts listed yet".
//
//   https://www.exchange.jo/en/products-services/securties-types/investment-funds
//   https://www.exchange.jo/en/products-services/securties-types/depository-receipts
//
// Suspensions: the ASE has no page of suspended companies. It announces
// each suspension, resumption and delisting as a circular of the "Public
// Companies" category (titles in Arabic: "ايقاف التداول" suspends, "إعادة
// ... الى التداول" and "الغاء القيود" resume, "الغاء ادراج" delists). The
// last two years of these circulars are read in date order; a listed share
// whose last circular is a suspension is then checked on its own company
// page: if it traded on the regular market after that circular, it is
// open again, otherwise it stays out. A suspension "for one session" or
// "for two sessions" older than a week is over. A line the ASE marks
// "Restricted Trading" stays: it is listed and takes orders under
// conditions; the note is kept in raw.
//
//   https://www.exchange.jo/en/circulars?category_id=1
//   https://www.exchange.jo/en/company_historical/<SYMBOL>
//
// The ISIN comes from the Securities Depository Center's ISIN list (the
// Jordanian numbering agency), joined on the ASE security number. Its four
// sector pages are read; bond and sukuk lines there are not used.
//
//   https://sdc.com.jo/en/isinList?cat=900&sub_cat=1&status=active  (to sub_cat=4)
//
// All rows are ASE shares in dinars (JOD). The place is written out in
// full: "ASE" alone reads as NYSE American in the venue table. The read
// (about 12 page loads) is kept for 12 hours in the system temp folder, so
// the scrapers run back to back read the ASE once.
//
//   import { writeAmmanCatalogue } from "../unitedarabjordan/ammanBook.mjs";
//   await writeAmmanCatalogue(import.meta.url, "<folder>-parsed.json");

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const EXCHANGE = "Amman Stock Exchange";
export const MIC = "XAMM";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SHARES = "https://www.exchange.jo/en/products-services/securties-types/shares";
const CIRCULARS = (page) => `https://www.exchange.jo/en/circulars?category_id=1&page=${page}`;
const COMPANY = (symbol) => `https://www.exchange.jo/en/company_historical/${symbol}`;
const SDC = (sector) => `https://sdc.com.jo/en/isinList?cat=900&sub_cat=${sector}&status=active`;
const MARKETS = { 1: "First Market", 2: "Second Market" };
const CACHE = path.join(os.tmpdir(), "amman-book-cache.json");
const CACHE_HOURS = 12;
const CIRCULAR_YEARS = 2;
const DAY = 86_400_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const text = await response.text();
        await sleep(1_200);
        return text;
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await sleep(1_500 * (attempt + 1));
  }
  throw new Error(last);
}

const clean = (text) =>
  String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tableRows(html) {
  return [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map(([row]) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, cell]) => clean(cell)));
}

// "22/10/2026" -> epoch ms (UTC midnight).
function dayOf(text) {
  const match = String(text).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : NaN;
}

// What a Public Companies circular does to the symbols it names.
function circularEvent(title) {
  if (/السوق الثاني|السوق الأول|السوق الاول/.test(title) && /وإدراجها|وادراجها/.test(title)) return "open";
  if (/(?:إلغاء|الغاء)\s+(?:إدراج|ادراج)/.test(title)) return "delisted";
  if (/(?:إعادة|اعادة)\s+(?:أسهم|اسهم|التداول|تداول)/.test(title)) return "open";
  if (/(?:إلغاء|الغاء)\s+(?:القيود|تقييد)/.test(title)) return "open";
  if (/(?:إيقاف|ايقاف)/.test(title)) return /لجلسة|لجلستي|لمدة جلس/.test(title) ? "timed" : "suspended";
  return "";
}

async function readCirculars() {
  const events = [];
  const oldest = Date.now() - CIRCULAR_YEARS * 365 * DAY;
  for (let page = 0; page < 12; page += 1) {
    const rows = tableRows(await get(CIRCULARS(page))).filter((cells) => cells.length === 4 && /^\d{2}\/\d{2}\/\d{4}$/.test(cells[3]));
    if (!rows.length) break;
    for (const [title, symbols, , date] of rows) {
      const number = Number(title.match(/رقم\s*\((\d+)\)/)?.[1] || 0);
      events.push({ day: dayOf(date), date, number, title, event: circularEvent(title), symbols: symbols.split("-").map((s) => s.trim()).filter(Boolean) });
    }
    if (Math.min(...rows.map((cells) => dayOf(cells[3]))) < oldest) break;
  }
  if (events.length < 50) throw new Error(`only ${events.length} ASE circulars read`);
  return events;
}

// Last regular-market trading day shown on the company page, or NaN.
async function lastTrade(symbol) {
  const html = await get(COMPANY(symbol));
  const start = html.indexOf("block-quicktabscompanyhistorical");
  if (start < 0) return NaN;
  const table = html.slice(start).match(/<table[\s\S]*?<\/table>/)?.[0] || "";
  const days = tableRows(table).map((cells) => dayOf(cells[0])).filter(Number.isFinite);
  return days.length ? Math.max(...days) : NaN;
}

async function crawl() {
  try {
    const kept = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - kept.at < CACHE_HOURS * 3600_000 && Array.isArray(kept.rows)) return kept;
  } catch {}

  // ASE security number -> ISIN, shares only.
  const isinOf = new Map();
  for (const sector of [1, 2, 3, 4]) {
    for (const [, number, isin, , kind] of tableRows(await get(SDC(sector)))) {
      if (kind !== "Share" || !/^JO[A-Z0-9]{9}\d$/.test(isin || "")) continue;
      isinOf.set(number, isin);
    }
  }
  if (isinOf.size < 150) throw new Error(`the SDC lists only ${isinOf.size} share ISINs`);

  const listed = [];
  const seen = new Set();
  for (const cells of tableRows(await get(SHARES))) {
    if (cells.length !== 8 || cells[0] === "Company's name") continue;
    const [name, short, symbol, code, market, , , notes] = cells;
    if (!/^[A-Z0-9]{2,6}$/.test(symbol) || !/^\d{6}$/.test(code)) throw new Error(`ASE row ${cells.join(" | ")}`);
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    listed.push({ name, short, symbol, code, market: MARKETS[market] || `Market ${market}`, notes, isin: isinOf.get(code) || "" });
  }
  // 154 listed companies on 2026-10-22, every one with the "active" mark.
  if (listed.length < 130) throw new Error(`the ASE table gave only ${listed.length} shares`);

  // Last circular per listed symbol, oldest first; same day by number.
  const events = (await readCirculars()).sort((a, b) => a.day - b.day || a.number - b.number);
  const last = new Map();
  for (const item of events) {
    if (!item.event) continue;
    for (const symbol of item.symbols) if (seen.has(symbol)) last.set(symbol, item);
  }
  const suspended = [];
  const resumed = [];
  for (const [symbol, item] of last) {
    if (item.event === "open") continue;
    if (item.event === "timed" && Date.now() - item.day > 7 * DAY) continue;
    // "suspended", "timed" (recent) or "delisted" while still on the list.
    const traded = await lastTrade(symbol);
    const note = `${symbol} ${item.date} circular ${item.number}: ${item.title.replace(/^[\d-]+-\([^)]*\)-\s*/, "")}`;
    if (Number.isFinite(traded) && traded > item.day) resumed.push(`${note} (traded ${new Date(traded).toISOString().slice(0, 10)})`);
    else suspended.push({ symbol, why: note });
  }

  const result = { at: Date.now(), rows: listed, suspended, resumed };
  try {
    fs.writeFileSync(CACHE, JSON.stringify(result));
  } catch {}
  return result;
}

// Every listed ASE share open to trade, as catalogue rows sorted by ticker;
// plus the suspended lines left out and the lines left out for no ISIN.
export async function ammanBook() {
  const { rows: listed, suspended, resumed } = await crawl();
  const out = new Set(suspended.map((item) => item.symbol));
  const rows = [];
  const leftOut = [];
  for (const line of listed) {
    if (out.has(line.symbol)) continue;
    if (!line.isin) {
      leftOut.push(`${line.symbol} no ISIN`);
      continue;
    }
    rows.push({
      query: line.symbol,
      ticker: line.symbol,
      name: line.name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "JOD",
      type: "STOCK",
      isin: line.isin,
      raw: [line.symbol, line.name, line.short, line.code, line.market, line.notes].filter(Boolean).join(" | "),
    });
  }
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  for (const ticker of ["ARBK", "JOPH", "JOIB", "THBK"]) {
    if (!rows.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
  }
  if (rows.length < 130) throw new Error(`only ${rows.length} ASE shares open`);
  if (suspended.length > 20) throw new Error(`${suspended.length} ASE shares read as suspended`);
  if (leftOut.length > 5) throw new Error(`${leftOut.length} ASE shares have no ISIN`);
  return { rows, suspended, resumed, leftOut };
}

// Writes <file> next to the calling scraper (`here` = its import.meta.url).
export async function writeAmmanCatalogue(here, file) {
  const { rows, suspended, leftOut } = await ammanBook();
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const counts = {};
  for (const row of kept) {
    const market = row.raw.split(" | ")[4];
    counts[market] = (counts[market] || 0) + 1;
  }
  console.error(counts);
  console.error(`${kept.length} ASE shares (STOCK, JOD), ${kept.filter((row) => /Restricted Trading/.test(row.raw)).length} of them under restricted trading`);
  console.error(`${suspended.length} suspended left out${suspended.length ? `: ${suspended.map((item) => item.why).join("; ")}` : ""}`);
  if (leftOut.length) console.error(`left out: ${leftOut.join(", ")}`);
  return kept;
}
