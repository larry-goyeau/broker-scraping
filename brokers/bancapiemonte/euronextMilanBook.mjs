// The Borsa Italiana book (Euronext Milan and ETFplus), for the Italian
// banks whose place is "Italy" and which print no list of their own
// (Banca del Piemonte). The book is every share line Euronext's product
// directory lists on Euronext Milan (the regulated market, STAR segment
// included) and every ETF, ETC and ETN line it lists on ETFplus, minus the
// lines Euronext's halt list shows suspended, minus warrants and rights,
// minus a line that has never traded.
//
// Source, public, no login: the "Download" button of Euronext's product
// directory, one semicolon file per product family and MIC, with name,
// ISIN, symbol, market, trading currency, the last session's prices and
// the last closing price:
//   https://live.euronext.com/en/markets/milan/equities/list
//   https://live.euronext.com/en/pd_es/data/stocks/download?mics=MTAA   (Euronext Milan shares)
//   https://live.euronext.com/en/pd_es/data/track/download?mics=ETFP    (ETFplus ETFs)
//   https://live.euronext.com/en/pd_es/data/etv/download?mics=ETFP      (ETFplus ETCs, ETNs)
// and the halt list Euronext prints on "Suspended instruments - current",
// one JSON feed for every Euronext market, the Milan ones included (it
// carries EuroTLX, SeDeX and MOT lines under ETLX, SEDX, MOTX):
//   https://live.euronext.com/en/resources/market-events/suspended/current
//   https://live.euronext.com/en/ajax/haltedInstrument/getAjax/current
// Names: Euronext prints Milan shares in short capitals ("CAIRO
// COMMUNICAT") and ETFplus lines as codes ("SSGETFSP500TETFP"), so the
// name comes from assets/etfs.csv / assets/stocks.csv by ISIN, else from
// the title of Borsa Italiana's own page of the line, e.g.
//   https://www.borsaitaliana.it/borsa/etf/scheda/IE000KXZPFM8.html?lang=en
//   https://www.borsaitaliana.it/borsa/etc-etn/scheda/XS2425313298-ETFP.html?lang=en
//   https://www.borsaitaliana.it/borsa/azioni/scheda/IT0005586497.html?lang=en
// cached in milan-names.json next to this file (a missed page keeps the
// Euronext name).
//
// Kept (exchange "Euronext Milan", MIC XMIL, as the Unicredit PL, XTB,
// Willbe and IBKR scrapers write Milan, shares and ETFs alike):
// - Every share of Euronext Milan, Italian or foreign (Stellantis, Ferrari,
//   STMicroelectronics, CNH...), savings shares (RSP, RISP) included. Type
//   STOCK.
// - Every ETF of ETFplus, active ETFs ("Act" in Euronext's code) included.
//   Type ETF.
// - Every ETFplus ETV: Euronext's code says which, "<issuer>ETC..." or
//   "<issuer>ETN..." (WISETCLEADIMETFP, 21SETNALTSETFP). Type ETC or ETN.
// Every kept line trades in EUR (checked: a non-EUR line stops the run).
// Left out:
// - A line on the halt list with no resumption yet (or a resumption still
//   to come). The halt list is read each run; on 25 October 2026 it held
//   no Euronext Milan, Growth Milan, ETFplus or GEM line (only EuroTLX and
//   SeDeX certificates and MOT bonds).
// - Warrants and rights the share file mixes in: names starting "W " or
//   "WARR" ("W DEXELANCE 26-29", "WARR DHH 25-28"), or with DIR / DIRITTI.
// - A line with neither a last price nor a closing price: never traded
//   (six SG and Leverage Shares ETNs on 25 October 2026). A line with a
//   closing price but no trade in the last session stays.
// - Places of their own in broker-list.json, off unless asked for:
//   `growth: true` adds Euronext Growth Milan (exchange "Euronext Growth
//   Milan", MIC EXGM, about 200 shares); `gem: true` adds the Euronext
//   Global Equity Market (about 1,000 foreign shares quoted in EUR in
//   Milan, "1AAPL", "1CNHI"; exchange "Euronext Milan", MIC XMIL, as XTB
//   writes them); `eurotlx: true` adds the EuroTLX share lines (exchange
//   "EuroTLX", MIC ETLX). Use them only for a broker whose pages say it
//   routes there.
// - MIV Milan (Euronext's download has no MIVX line), Trading After Hours
//   (a session of lines already listed, not a listing), SeDeX
//   certificates, bonds and funds: not read.
//
// Three downloads (up to six with every option) and the halt feed (about
// 4 MB), a pause between each; Borsa Italiana pages only for names the
// cache and the shared lists lack, 1.5 s apart.
//
// Use:
//   import { writeMilanCatalogue } from "../bancapiemonte/euronextMilanBook.mjs";
//   await writeMilanCatalogue(import.meta.url, "bancapiemonte-parsed.json");
//   // options: { types: ["STOCK", "ETF", "ETC", "ETN"], growth: false, gem: false, eurotlx: false }
//   // or: const { listed, suspended, idle, leftOut } = await milanBook();
//
//   node brokers/bancapiemonte/euronextMilanBook.mjs     (prints the counts, writes nothing but the name cache)
//   node brokers/bancapiemonte/euronextMilanBook.mjs --growth --gem --eurotlx

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "https://live.euronext.com/en/pd_es/data/";
const HALTED = "https://live.euronext.com/en/ajax/haltedInstrument/getAjax/current";
const BORSA = "https://www.borsaitaliana.it/borsa/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const NAME_CACHE = new URL("./milan-names.json", import.meta.url);
const ASSETS = ["../../assets/etfs.csv", "../../assets/stocks.csv"].map((path) => new URL(path, import.meta.url));
const FILES = { stocks: "STOCK", track: "ETF", etv: "ETV" };
const MARKETS = {
  MTAA: { exchange: "Euronext Milan", mic: "XMIL", market: /^Euronext Milan$/, files: ["stocks"] },
  ETFP: { exchange: "Euronext Milan", mic: "XMIL", market: /^ETF Plus$/, files: ["track", "etv"] },
  EXGM: { exchange: "Euronext Growth Milan", mic: "EXGM", market: /^Euronext Growth Milan$/, files: ["stocks"] },
  BGEM: { exchange: "Euronext Milan", mic: "XMIL", market: /^Euronext Global Equity Market$/, files: ["stocks"] },
  ETLX: { exchange: "EuroTLX", mic: "ETLX", market: /^EuroTLX$/, files: ["stocks"] },
};
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
// Warrants ("W AATECH 23-28", "WARR EHI", "WARRANT"), rights ("DIR",
// "DIRITTI").
const NOT_A_SHARE = /^W\s|^WARR|\bWARRANT|\bDIR(ITTI?)?\b/i;
// Euronext's ETFplus code: issuer, then ETF / ETC / ETN / Act.
const ETV_CODE = /^.{1,5}?\s?(ETC|ETN)/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function get(url, as = "text", tries = 4) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (attempt) await sleep(5000 * attempt);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Referer: "https://live.euronext.com/en/markets/milan/equities/list" },
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

// "MIC ISIN" -> { name, symbol, halted, reason } for every line halted now.
async function haltedLines() {
  const body = await get(HALTED, "json");
  if (!Array.isArray(body?.data)) throw new Error("Euronext halt list: no data");
  if (body.data.length < 100) throw new Error(`Euronext halt list has only ${body.data.length} lines`);
  const now = Date.now();
  const out = new Map();
  for (const raw of body.data) {
    const [halted, mic, , , isin, name, symbol, , category, reason, resumption] = raw.map(clean);
    const date = resumption.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (date) {
      const [, d, m, y, hh, mm] = date;
      // Milan time, give or take the summer hour: a resumption that is
      // already behind us means the line trades again.
      if (Date.UTC(+y, m - 1, +d, hh - 1, +mm) < now) continue;
    }
    out.set(`${mic} ${isin}`, { name, symbol, category, reason, halted: halted.slice(0, 10) });
  }
  return out;
}

// ISIN -> name from the shared lists, the first line of each ISIN.
function assetNames() {
  const out = new Map();
  for (const file of ASSETS) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
      const row = [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((match) => match[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim());
      const [, , isin, name] = row;
      if (ISIN.test(isin || "") && name && !out.has(isin)) out.set(isin, name);
    }
  }
  return out;
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(NAME_CACHE, "utf8"));
  } catch {
    return {};
  }
}

// The name Borsa Italiana's page of the line puts in its title, or "".
async function borsaName(isin, type) {
  const path = type === "STOCK" ? `azioni/scheda/${isin}.html` : type === "ETF" ? `etf/scheda/${isin}.html` : `etc-etn/scheda/${isin}-ETFP.html`;
  try {
    const page = await get(`${BORSA}${path}?lang=en`, "text", 2);
    const title = clean(page.match(/<title>([^<]*)<\/title>/i)?.[1] || "");
    const match = title.match(/^(.*?)\s+(Stock\s+)?Real Time Quotes\s*\|\s*([A-Z0-9]{12})/i);
    return match && match[3] === isin ? match[1].trim() : "";
  } catch {
    return "";
  }
}

function etvKind(code) {
  const kind = code.match(ETV_CODE)?.[1];
  if (kind) return kind;
  return /ETC/i.test(code) ? "ETC" : "ETN";
}

export async function milanBook({ growth = false, gem = false, eurotlx = false } = {}) {
  const sources = ["MTAA", "ETFP", ...(growth ? ["EXGM"] : []), ...(gem ? ["BGEM"] : []), ...(eurotlx ? ["ETLX"] : [])];
  const reads = [];
  for (const source of sources) {
    for (const file of MARKETS[source].files) {
      reads.push({ source, file, lines: await download(file, source) });
      await sleep(2000);
    }
  }
  const halted = await haltedLines();

  const listed = [];
  const suspended = [];
  const idle = [];
  const leftOut = [];
  const seen = new Set();
  for (const { source, file, lines } of reads) {
    const { exchange, mic, market } = MARKETS[source];
    for (const line of lines) {
      const ticker = clean(line.Symbol);
      const isin = clean(line.ISIN).toUpperCase();
      const code = clean(line.Name);
      const currency = clean(line.Currency);
      const label = `${ticker} ${code} (${isin})`;
      if (!market.test(clean(line.Market))) throw new Error(`${label} in the ${source} ${file} file is on "${line.Market}"`);
      if (currency !== "EUR") throw new Error(`${label} on ${source} trades in ${currency || "nothing"}`);
      if (file === "stocks" && NOT_A_SHARE.test(code)) {
        leftOut.push(`${label} on ${source}: warrant or right`);
        continue;
      }
      const stop = halted.get(`${source} ${isin}`) || halted.get(`${mic} ${isin}`);
      if (stop) {
        suspended.push({ ticker, name: code, isin, mic: source, since: stop.halted, reason: stop.reason });
        continue;
      }
      const priced = (value) => clean(value) && clean(value) !== "-";
      if (!priced(line["last Price"]) && !priced(line["Closing Price"])) {
        idle.push({ ticker, name: code, isin, mic: source });
        continue;
      }
      const key = `${mic} ${isin} ${currency}`;
      if (seen.has(key)) {
        leftOut.push(`${label}: twice on ${mic}`);
        continue;
      }
      seen.add(key);
      const type = FILES[file] === "ETV" ? etvKind(code) : FILES[file];
      listed.push({
        query: ticker,
        ticker,
        name: code,
        exchange,
        mic,
        currency,
        type,
        isin,
        raw: `${ticker} | ${code} | ${clean(line.Market)} | ${currency} | ${isin} | Euronext ${file} ${source}`,
      });
    }
  }

  // Readable names: the shared lists, then the cache, then Borsa Italiana.
  const shared = assetNames();
  const cache = readCache();
  let asked = 0;
  for (const row of listed) {
    const name = shared.get(row.isin) || cache[row.isin];
    if (name) {
      row.name = name;
      continue;
    }
    if (asked) await sleep(1500);
    asked += 1;
    const found = await borsaName(row.isin, row.type);
    if (found) {
      cache[row.isin] = found;
      row.name = found;
    }
  }
  if (asked) fs.writeFileSync(NAME_CACHE, `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 1)}\n`);

  listed.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));

  // Sanity: the big names are there, counts hold.
  const has = (ticker, type) => listed.some((row) => row.ticker === ticker && row.type === type);
  for (const ticker of ["ISP", "UCG", "ENI", "ENEL", "RACE", "STLAM", "G", "STMMI"]) if (!has(ticker, "STOCK")) throw new Error(`${ticker} missing on Euronext Milan`);
  for (const ticker of ["CSSPX", "SWDA", "VWCE"]) if (!has(ticker, "ETF")) throw new Error(`${ticker} missing on ETFplus`);
  for (const ticker of ["PHAU", "SGLD"]) if (!has(ticker, "ETC")) throw new Error(`${ticker} missing on ETFplus`);
  const count = (exchange, type, sourceMic) => listed.filter((row) => row.exchange === exchange && (!type || row.type === type) && (!sourceMic || row.raw.endsWith(` ${sourceMic}`))).length;
  if (count("Euronext Milan", "STOCK", "MTAA") < 170) throw new Error(`only ${count("Euronext Milan", "STOCK", "MTAA")} Euronext Milan shares`);
  if (count("Euronext Milan", "ETF") < 1500) throw new Error(`only ${count("Euronext Milan", "ETF")} ETFplus ETFs`);
  if (count("Euronext Milan", "ETC") + count("Euronext Milan", "ETN") < 300) throw new Error("fewer than 300 ETFplus ETCs and ETNs");
  if (growth && count("Euronext Growth Milan") < 150) throw new Error(`only ${count("Euronext Growth Milan")} Growth Milan lines`);
  if (gem && count("Euronext Milan", "STOCK", "BGEM") < 600) throw new Error(`only ${count("Euronext Milan", "STOCK", "BGEM")} GEM lines`);
  if (eurotlx && count("EuroTLX") < 200) throw new Error(`only ${count("EuroTLX")} EuroTLX share lines`);
  if (suspended.length > 40) throw new Error(`${suspended.length} lines read as suspended`);
  if (idle.length > 40) throw new Error(`${idle.length} lines read as never traded: ${idle.map((line) => line.ticker).join(" ")}`);
  return { listed, suspended, idle, leftOut };
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types (["STOCK"] for a broker that sells no ETP); `growth`, `gem`,
// `eurotlx` add those Milan markets.
export async function writeMilanCatalogue(here, file, { types = ["STOCK", "ETF", "ETC", "ETN"], growth = false, gem = false, eurotlx = false } = {}) {
  const book = await milanBook({ growth, gem, eurotlx });
  const rows = book.listed.filter((row) => types.includes(row.type)).map((row) => ({ ...row }));
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  report(book, kept);
  return kept;
}

function report(book, kept) {
  const counts = {};
  for (const row of kept) {
    const key = `${row.raw.split(" ").pop()} ${row.type}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.error(`${kept.length} Borsa Italiana lines ${JSON.stringify(counts)}`);
  console.error(`${book.suspended.length} suspended left out${book.suspended.length ? ": " : ""}${book.suspended.map((line) => `${line.ticker} (${line.mic}, since ${line.since}, ${line.reason})`).join(", ")}`);
  if (book.idle.length) console.error(`never traded, left out: ${book.idle.map((line) => `${line.ticker} (${line.mic})`).join(", ")}`);
  if (book.leftOut.length) console.error(`left out: ${book.leftOut.length} lines (${book.leftOut.slice(0, 8).join(", ")}${book.leftOut.length > 8 ? ", ..." : ""})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const book = await milanBook({
    growth: process.argv.includes("--growth"),
    gem: process.argv.includes("--gem"),
    eurotlx: process.argv.includes("--eurotlx"),
  });
  report(book, book.listed);
}
