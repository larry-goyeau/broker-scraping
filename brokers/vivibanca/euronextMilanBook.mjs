// The Euronext Milan book, for the Italian banks whose only place is
// Euronext Milan (Borsa Italiana) and which print no list of their own
// (ViViBanca). The book is every share line of the Euronext Milan
// regulated market (STAR included) and every ETF, ETC and ETN line of
// ETFplus, the Borsa Italiana regulated market for exchange-traded
// products, minus warrants and rights, minus the lines Euronext's halt
// list shows halted, minus a share with no trade for 30 days (suspended),
// minus a line that has never traded.
//
// Source, public, no login: Euronext's product directory for Milan, read
// two ways for each product family:
// - the "Download" button (semicolon file: name, ISIN, symbol, market,
//   trading currency, last price, closing price):
//     https://live.euronext.com/en/markets/milan/equities/list
//     https://live.euronext.com/en/pd_es/data/stocks/download?mics=MTAA   (shares)
//     https://live.euronext.com/en/pd_es/data/track/download?mics=ETFP    (ETFs)
//     https://live.euronext.com/en/pd_es/data/etv/download?mics=ETFP      (ETCs, ETNs)
// - the table behind the same pages (POST, one call per family), which
//   adds the full fund name (Borsa Italiana's short names read
//   "AB ActEBNDETFP"; the table's hover title reads "AllianceBernstein
//   Euro Corporate Bond Portfolio UCITS ETF") and the date of each line's
//   last trade:
//     https://live.euronext.com/en/pd_es/data/stocks?mics=MTAA (track, etv ?mics=ETFP)
// and the halt list Euronext prints on "Suspended instruments - current":
//     https://live.euronext.com/en/ajax/haltedInstrument/getAjax/current
//
// Kept (exchange "Euronext Milan", MIC XMIL, as the IBKR, Easybroker,
// Comdirect and Consorsbank scrapers write Milan):
// - Every share of Euronext Milan, Italian or foreign (Stellantis,
//   Ferrari, STMicroelectronics are NL-ISIN lines), the STAR segment
//   (Reply, Sesa, El.En., SOL...) and savings shares (Webuild RSP).
//   Type STOCK.
// - Every ETF of ETFplus, index and active. Type ETF.
// - Every ETC and ETN of ETFplus. Borsa Italiana's short name says which
//   ("21SETNCCBTCETFP" is a 21Shares ETN, "SG ETCFARGETFP" an SG ETC).
//   Type ETC or ETN.
// Every kept line trades in EUR (checked: another currency stops the run).
// Left out:
// - Warrants and rights the share file mixes in ("W DEXELANCE 26-29").
// - A line on Euronext's halt list (MIC MTAA, ETFP or EXGM) with no
//   resumption yet. On 25 October 2026 the list held no Milan share or
//   ETP: Borsa Italiana announces its suspensions in its own "comunicati
//   urgenti", not on that list.
// - A share whose last trade is more than 30 days old. A Euronext Milan
//   share that does not trade for a month is suspended: on 25 October
//   2026 this caught exactly the four lines Borsa Italiana suspended
//   until further notice (Bestbe Holding, last trade 25 Nov 2025; OPS
//   Retail, 24 Apr 2026; OPS Italia, 30 Apr 2026; OPS Ecom, 28 Jul 2026).
//   ETPs are not dropped for age: market makers keep quoting ETFplus
//   lines that seldom trade.
// - A line with neither a trade nor a closing price: never traded (six
//   SG and Leverage Shares ETNs on 25 October 2026).
// - Euronext Growth Milan (EXGM), an MTF that broker-list.json files as
//   its own place. `growth: true` adds it, as exchange "Euronext Growth
//   Milan", MIC EXGM, for a broker whose pages say it routes there; its
//   shares trade so seldom that the age rule is 180 days there.
// - Euronext Global Equity Market (BGEM, foreign shares quoted in EUR),
//   Euronext MIV Milan (closed-end funds, empty on 25 October 2026),
//   EuroTLX, SeDeX, MOT, ATFund: other markets, not read.
//
// Seven calls (eleven with Growth), a pause between each; the halt feed
// is about 4 MB; no cache needed.
//
// Use:
//   import { writeMilanCatalogue } from "../vivibanca/euronextMilanBook.mjs";
//   await writeMilanCatalogue(import.meta.url, "vivibanca-parsed.json");
//   // options: { types: ["STOCK", "ETF", "ETC", "ETN"], growth: false }
//   // or: const { listed, suspended, idle, leftOut } = await milanBook();
//
//   node brokers/vivibanca/euronextMilanBook.mjs     (prints the counts, writes nothing)
//   node brokers/vivibanca/euronextMilanBook.mjs --growth

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "https://live.euronext.com/en/pd_es/data/";
const HALTED = "https://live.euronext.com/en/ajax/haltedInstrument/getAjax/current";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const REFERER = "https://live.euronext.com/en/markets/milan/equities/list";
const DAY = 86_400_000;
const MARKETS = {
  MTAA: { exchange: "Euronext Milan", mic: "XMIL", market: /^Euronext Milan$/, files: ["stocks"], staleDays: 30 },
  ETFP: { exchange: "Euronext Milan", mic: "XMIL", market: /^ETF Plus$/, files: ["track", "etv"], staleDays: Infinity },
  EXGM: { exchange: "Euronext Growth Milan", mic: "EXGM", market: /^Euronext Growth Milan$/, files: ["stocks"], staleDays: 180 },
};
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
// Warrants ("W DEXELANCE 26-29", "WARR DHH 25-28", "WDESTINATION 24-27")
// and rights ("DIR OPZ").
const NOT_A_SHARE = /^W\s|^WARR|^W[A-Z]+ \d{2}-\d{2}$|\bWARRANT|\bDIR(ITTI)?\b|\bDIRITTO\b/i;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

async function get(url, { as = "text", body } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await sleep(5000 * attempt);
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        body,
        headers: {
          "User-Agent": UA,
          "X-Requested-With": "XMLHttpRequest",
          Referer: REFERER,
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}),
        },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        last = `${response.status} ${url}`;
        continue;
      }
      return as === "json" ? await response.json() : await response.text();
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
  }
  throw new Error(last);
}

function cells(line) {
  return [...line.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map((match) => match[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim()).slice(0, -1);
}

// One Euronext download as objects keyed by its header.
async function download(file, mic) {
  const lines = (await get(`${BASE}${file}/download?mics=${mic}`)).replace(/^﻿/, "").split(/\r?\n/);
  const header = cells(lines[0] || "");
  for (const column of ["Name", "ISIN", "Symbol", "Market", "Currency", "last Price", "Closing Price"]) {
    if (!header.includes(column)) throw new Error(`Euronext ${file} ${mic}: no "${column}" column (${lines[0]})`);
  }
  const out = [];
  for (const line of lines.slice(1)) {
    const row = cells(line);
    if (row.length < header.length - 1 || !ISIN.test(row[header.indexOf("ISIN")] || "")) continue;
    out.push(Object.fromEntries(header.map((column, i) => [column, row[i] ?? ""])));
  }
  return out;
}

// "17 Sep 2026" -> ms (UTC midnight), or null.
function tradeDay(text) {
  const match = clean(text).match(/(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/);
  return match && match[2] in MONTHS ? Date.UTC(+match[3], MONTHS[match[2]], +match[1]) : null;
}

// The directory table: ISIN -> { fullName, lastTrade (ms or null) }.
async function table(file, mic) {
  const body = new URLSearchParams({
    draw: "1",
    start: "0",
    length: "10000",
    iDisplayStart: "0",
    iDisplayLength: "10000",
    "args[display_datapoints]": "name,isin,symbol,lastPrice,lastTradeTime",
  }).toString();
  const json = await get(`${BASE}${file}?mics=${mic}`, { as: "json", body });
  if (!Array.isArray(json?.aaData) || !json.aaData.length) throw new Error(`Euronext ${file} ${mic} table: no rows`);
  if (json.aaData.length !== Number(json.iTotalRecords)) throw new Error(`Euronext ${file} ${mic} table: ${json.aaData.length} of ${json.iTotalRecords} rows`);
  const out = new Map();
  for (const row of json.aaData) {
    const [nameCell, isinCell, , , timeCell] = row;
    const isin = clean(isinCell).toUpperCase();
    if (!ISIN.test(isin)) throw new Error(`Euronext ${file} ${mic} table: no ISIN in ${JSON.stringify(row).slice(0, 200)}`);
    const hover = String(nameCell).match(/data-title-hover="([^"]*)"/);
    out.set(isin, { fullName: hover ? clean(hover[1]) : "", lastTrade: tradeDay(timeCell) });
  }
  return out;
}

// "MIC ISIN" -> { name, symbol, halted, reason } for every line halted now.
async function haltedLines() {
  const body = await get(HALTED, { as: "json" });
  if (!Array.isArray(body?.data)) throw new Error("Euronext halt list: no data");
  if (body.data.length < 100) throw new Error(`Euronext halt list has only ${body.data.length} lines`);
  const now = Date.now();
  const out = new Map();
  for (const raw of body.data) {
    const [halted, mic, , , isin, name, symbol, , category, reason, resumption] = raw.map(clean);
    const date = resumption.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (date) {
      const [, d, m, y, hh, mm] = date;
      // Milan time, give or take the summer hour: a resumption already
      // behind us means the line trades again.
      if (Date.UTC(+y, m - 1, +d, hh - 1, +mm) < now) continue;
    }
    out.set(`${mic} ${isin}`, { name, symbol, category, reason, halted: halted.slice(0, 10) });
  }
  return out;
}

// Borsa Italiana's short ETP names carry the kind after the issuer code:
// "21SETNCCBTCETFP", "SG ETCFARGETFP", "LEVETNSPY USETFP".
function etvKind(shortName, fullName) {
  const code = shortName.match(/^.{2,4}?\s?(ETN|ETC)/i);
  if (code) return code[1].toUpperCase();
  if (/\bETN\b/i.test(fullName)) return "ETN";
  if (/\bETC\b/i.test(fullName)) return "ETC";
  throw new Error(`ETFplus ETP "${shortName}" (${fullName}): neither ETC nor ETN`);
}

export async function milanBook({ growth = false } = {}) {
  const segments = ["MTAA", "ETFP", ...(growth ? ["EXGM"] : [])];
  const reads = [];
  for (const segment of segments) {
    for (const file of MARKETS[segment].files) {
      const lines = await download(file, segment);
      await sleep(2000);
      const extra = await table(file, segment);
      await sleep(2000);
      reads.push({ segment, file, lines, extra });
    }
  }
  const halted = await haltedLines();
  const now = Date.now();

  const listed = [];
  const suspended = [];
  const idle = [];
  const leftOut = [];
  const seen = new Set();
  for (const { segment, file, lines, extra } of reads) {
    const { exchange, mic, market, staleDays } = MARKETS[segment];
    if (extra.size !== lines.length) leftOut.push(`${segment} ${file}: table has ${extra.size} lines, download ${lines.length}`);
    for (const line of lines) {
      const ticker = clean(line.Symbol);
      const isin = clean(line.ISIN).toUpperCase();
      const shortName = clean(line.Name);
      const currency = clean(line.Currency);
      const more = extra.get(isin) || { fullName: "", lastTrade: null };
      const name = more.fullName || shortName;
      const label = `${ticker} ${shortName} (${isin})`;
      if (!market.test(clean(line.Market))) throw new Error(`${label} in the ${segment} ${file} file is on "${line.Market}"`);
      if (currency !== "EUR") throw new Error(`${label} on ${segment} trades in ${currency || "nothing"}`);
      if (file === "stocks" && NOT_A_SHARE.test(shortName)) {
        leftOut.push(`${label} on ${segment}: warrant or right`);
        continue;
      }
      const stop = halted.get(`${segment} ${isin}`);
      if (stop) {
        suspended.push({ ticker, name, isin, segment, since: stop.halted, reason: `Euronext halt list: ${stop.reason}` });
        continue;
      }
      const priced = (value) => clean(value) && clean(value) !== "-";
      if (!more.lastTrade && !priced(line["last Price"]) && !priced(line["Closing Price"])) {
        idle.push({ ticker, name, isin, segment });
        continue;
      }
      if (more.lastTrade && now - more.lastTrade > staleDays * DAY) {
        const since = new Date(more.lastTrade).toISOString().slice(0, 10);
        suspended.push({ ticker, name, isin, segment, since, reason: `no trade for ${staleDays}+ days` });
        continue;
      }
      const key = `${mic} ${isin} ${currency}`;
      if (seen.has(key)) {
        leftOut.push(`${label}: twice on ${segment}`);
        continue;
      }
      seen.add(key);
      const type = file === "stocks" ? "STOCK" : file === "track" ? "ETF" : etvKind(shortName, name);
      const lastTrade = more.lastTrade ? new Date(more.lastTrade).toISOString().slice(0, 10) : "none";
      listed.push({
        query: ticker,
        ticker,
        name,
        exchange,
        mic,
        currency,
        type,
        isin,
        raw: `${ticker} | ${shortName} | ${clean(line.Market)} | ${currency} | ${isin} | last trade ${lastTrade} | Euronext ${file}`,
      });
    }
  }

  listed.sort((left, right) => left.mic.localeCompare(right.mic) || left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));

  // Sanity: the big names are there, counts hold.
  const has = (ticker, mic = "XMIL") => listed.some((row) => row.ticker === ticker && row.mic === mic);
  for (const ticker of ["ENI", "ISP", "UCG", "RACE", "STLAM", "ENEL", "REY", "SWDA", "CSSPX", "VWCE", "PHAU", "BTCE"]) if (!has(ticker)) throw new Error(`${ticker} missing on Milan`);
  const count = (mic, type) => listed.filter((row) => row.mic === mic && (!type || row.type === type)).length;
  if (count("XMIL", "STOCK") < 180) throw new Error(`only ${count("XMIL", "STOCK")} Euronext Milan shares`);
  if (count("XMIL", "ETF") < 1500) throw new Error(`only ${count("XMIL", "ETF")} ETFplus ETFs`);
  if (count("XMIL", "ETC") + count("XMIL", "ETN") < 300) throw new Error("fewer than 300 ETFplus ETCs and ETNs");
  if (growth && count("EXGM") < 150) throw new Error(`only ${count("EXGM")} Growth Milan lines`);
  if (suspended.length > (growth ? 60 : 25)) throw new Error(`${suspended.length} lines read as suspended`);
  if (idle.length > 30) throw new Error(`${idle.length} lines read as never traded: ${idle.map((line) => line.ticker).join(" ")}`);
  return { listed, suspended, idle, leftOut };
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types (["STOCK"] for a broker that sells no ETP); `growth` adds Euronext
// Growth Milan.
export async function writeMilanCatalogue(here, file, { types = ["STOCK", "ETF", "ETC", "ETN"], growth = false } = {}) {
  const book = await milanBook({ growth });
  const rows = book.listed.filter((row) => types.includes(row.type)).map((row) => ({ ...row }));
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  report(book, kept);
  return kept;
}

function report(book, kept) {
  const counts = {};
  for (const row of kept) {
    const key = `${row.mic} ${row.type}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.error(`${kept.length} Milan lines ${JSON.stringify(counts)}`);
  console.error(`${book.suspended.length} suspended left out${book.suspended.length ? ": " : ""}${book.suspended.map((line) => `${line.ticker} (${line.segment}, since ${line.since}, ${line.reason})`).join(", ")}`);
  if (book.idle.length) console.error(`never traded, left out: ${book.idle.map((line) => `${line.ticker} (${line.segment})`).join(", ")}`);
  if (book.leftOut.length) console.error(`left out: ${book.leftOut.join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const book = await milanBook({ growth: process.argv.includes("--growth") });
  report(book, book.listed);
}
