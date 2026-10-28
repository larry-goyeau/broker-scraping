// Every share that can be bought on the BRVM (Bourse Régionale des Valeurs
// Mobilières, Abidjan) today, for the brokers whose only place is that
// exchange (societegeneralew, bridge, boa, nsia, attijariwestafri and the
// other SGIs of the UEMOA).
//
// The list is the exchange's own share price page, which prints every listed
// share once a session: symbol, name, volume, previous close, open, close and
// change. A company that left the exchange is no longer on it (Movis CI,
// SVOC, delisted in June 2025; Trituraf, TTRC, in liquidation). The BRVM
// lists no ETF, ETN or ETC; its bonds and subscription rights are on other
// pages and are not read. Every line is quoted in francs CFA (XOF).
//
// The page does not say which shares are suspended. The exchange's daily
// official bulletin (Bulletin Officiel de la Cote, one PDF per session) does:
// its legend reads "SP: Suspendu", and a suspended share prints "SP" in place
// of its opening and closing prices. A share flagged SP on the latest
// bulletin is left out, unless it traded in the session of the price page
// (which can be a day newer than the bulletin): then it has resumed and is
// kept. On the 2026-10-22 bulletin that was SEMC (Eviosys Packaging Siem CI)
// and SICC (Sicor CI).
//
// Neither page gives an ISIN. It comes from the BRVM lines of the shared list
// assets/stocks.csv (stocks.csv writes Ecobank Transnational, ETIT, under
// XBRV). A share missing from it is kept with no ISIN and reported, and
// stampRows (accepted.mjs) tries again from the other shared lists.
//
//   https://www.brvm.org/fr/cours-actions/0
//   https://www.brvm.org/fr/bulletins-officiels-de-la-cote
//   https://www.brvm.org/sites/default/files/boc_20261022.pdf
//
// Use:
//   import { brvmBook } from "../societegeneralew/brvmBook.mjs";
//   const { rows, suspended, resumed, noIsin, sessionDate, bulletinDate, bulletinUrl } = await brvmBook();
//
//   node brokers/societegeneralew/brvmBook.mjs      prints the counts

import fs from "node:fs";
import zlib from "node:zlib";

const COURS = "https://www.brvm.org/fr/cours-actions/0";
const BULLETINS = "https://www.brvm.org/fr/bulletins-officiels-de-la-cote";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FLOOR = 44;
const MAX_SUSPENDED = 6;
const MAX_AGE_DAYS = 10;
const KNOWN = ["SNTS", "ORAC", "SGBC"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, binary = false) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const text = (html) =>
  String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#0?39;|&apos;|[’‘]/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|[\s  ]+/g, " ")
    .trim();
const number = (cell) => Number(text(cell).replace(/\s/g, "").replace(",", ".")) || 0;
const age = (day) => (Date.now() - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;

// "Dernière mise à jour : Vendredi, 23 octobre, 2026 - 22:45"
function frenchDay(words) {
  const match = String(words).toLowerCase().match(/(\d{1,2})\s+([a-zéû]+),?\s+(\d{4})/);
  const month = match ? MONTHS.indexOf(match[2]) + 1 : 0;
  if (!month) return "";
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

// The price page: one line per listed share.
async function priceSheet() {
  const html = await get(COURS);
  const sessionDate = frenchDay(html.match(/Derni[eè]re mise [àa] jour\s*:\s*([^<]+)/)?.[1]);
  if (!sessionDate || !(age(sessionDate) < MAX_AGE_DAYS)) throw new Error(`the BRVM price page is dated ${sessionDate || "(none)"}`);
  const lines = new Map();
  for (const tr of html.split(/<tr[\s>]/i).slice(1)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length !== 7) continue;
    const ticker = text(cells[0]).toUpperCase();
    const name = text(cells[1]);
    if (!/^[A-Z]{3,6}$/.test(ticker) || !name) throw new Error(`unreadable price line ${text(tr).slice(0, 120)}`);
    if (lines.has(ticker)) throw new Error(`${ticker} repeats on the price page`);
    lines.set(ticker, { ticker, name, volume: number(cells[2]), previous: number(cells[3]), open: number(cells[4]), close: number(cells[5]) });
  }
  if (lines.size < FLOOR) throw new Error(`the BRVM price page lists ${lines.size} shares`);
  return { sessionDate, lines };
}

// A PDF literal string, from after its "(" to its ")"; returns [string, end].
function literal(source, start) {
  let out = "";
  let depth = 1;
  let at = start;
  while (at < source.length) {
    const char = source[at];
    if (char === "\\") {
      const next = source[at + 1];
      const octal = source.slice(at + 1, at + 4).match(/^[0-7]{1,3}/)?.[0];
      if (octal) {
        out += String.fromCharCode(parseInt(octal, 8));
        at += 1 + octal.length;
        continue;
      }
      const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
      if (next === "\r" || next === "\n") at += next === "\r" && source[at + 2] === "\n" ? 3 : 2;
      else {
        out += escapes[next] ?? next;
        at += 2;
      }
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")" && (depth -= 1) === 0) return [out, at + 1];
    out += char;
    at += 1;
  }
  return [out, at];
}

// The text a content stream shows, one line per BT ... ET block.
function streamLines(source) {
  const lines = [];
  let line = "";
  let pending = [];
  let at = 0;
  while (at < source.length) {
    const char = source[at];
    if (char === "(") {
      const [value, end] = literal(source, at + 1);
      pending.push(value);
      at = end;
      continue;
    }
    if (char === "%") {
      while (at < source.length && source[at] !== "\n" && source[at] !== "\r") at += 1;
      continue;
    }
    if (char === "<" && source[at + 1] !== "<") {
      const end = source.indexOf(">", at);
      at = end < 0 ? source.length : end + 1;
      continue;
    }
    if (/[A-Za-z'"]/.test(char)) {
      let end = at;
      while (end < source.length && /[A-Za-z0-9*'"]/.test(source[end])) end += 1;
      const operator = source.slice(at, end);
      if (operator === "Tj" || operator === "TJ" || operator === "'" || operator === '"') line += pending.join("");
      else if (operator === "ET") {
        if (line.trim()) lines.push(line);
        line = "";
      }
      pending = [];
      at = end;
      continue;
    }
    at += 1;
  }
  return lines;
}

// Every compressed stream of the PDF that reads as page text, in file order.
function pdfLines(pdf) {
  const lines = [];
  const latin = pdf.toString("latin1");
  const marker = /stream\r?\n/g;
  let match;
  while ((match = marker.exec(latin))) {
    const start = match.index + match[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) break;
    let body = "";
    try {
      body = zlib.inflateSync(pdf.subarray(start, end), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString("latin1");
    } catch {
      body = "";
    }
    if (/\bBT\b/.test(body) && /T[jJ]/.test(body)) lines.push(...streamLines(body));
    marker.lastIndex = end;
  }
  return lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// The latest official bulletin: the shares it flags "SP", by symbol.
async function bulletin() {
  const page = await get(BULLETINS);
  const files = [...new Set([...page.matchAll(/https?:\/\/www\.brvm\.org\/sites\/default\/files\/boc_(\d{8})(?:_(\d+))?\.pdf/g)].map((match) => match[0]))];
  const key = (url) => {
    const [, day, version = "0"] = url.match(/boc_(\d{8})(?:_(\d+))?\.pdf/);
    return `${day}${version.padStart(3, "0")}`;
  };
  files.sort((left, right) => key(right).localeCompare(key(left)));
  const url = files[0];
  if (!url) throw new Error("no official bulletin linked on the BRVM bulletins page");
  const compact = url.match(/boc_(\d{8})/)[1];
  const bulletinDate = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6)}`;
  if (!(age(bulletinDate) < MAX_AGE_DAYS)) throw new Error(`the latest official bulletin is dated ${bulletinDate}`);
  await sleep(1500);
  const lines = pdfLines(await get(url, true));
  // The shares pages come first and end at the legend that defines SP.
  const legend = lines.findIndex((line) => /^L.gende\s*:/.test(line) && /SP\s*:\s*Suspendu/.test(line));
  if (legend < 100) throw new Error(`${url}: no share legend found (${lines.length} text lines)`);
  const shares = new Map();
  let current = null;
  for (const line of lines.slice(0, legend)) {
    if (/^[A-Z]{4,5}$/.test(line) && line !== "TOTAL") {
      current = line;
      if (!shares.has(current)) shares.set(current, { suspended: false });
      continue;
    }
    if (current && line === "SP") shares.get(current).suspended = true;
  }
  return { url, bulletinDate, shares };
}

// The BRVM lines of the shared stock list: ticker -> ISIN.
function sharedIsins() {
  const book = new Map();
  for (const line of fs.readFileSync(STOCKS, "utf8").split(/\r?\n/)) {
    const [symbol = "", place = "", isin = ""] = line.split(",");
    if (place !== "BRVM" && place !== "XBRV") continue;
    const ticker = symbol.split(":").pop().trim().toUpperCase();
    if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) book.set(ticker, isin.toUpperCase());
  }
  return book;
}

export async function brvmBook() {
  const sheet = await priceSheet();
  await sleep(1500);
  const boc = await bulletin();
  const isins = sharedIsins();

  const notOnBulletin = [...sheet.lines.keys()].filter((ticker) => !boc.shares.has(ticker));
  if (notOnBulletin.length > 3) throw new Error(`${notOnBulletin.length} shares of the price page are not on ${boc.url}: ${notOnBulletin.join(", ")}`);

  const rows = [];
  const suspended = [];
  const resumed = [];
  const noIsin = [];
  for (const line of [...sheet.lines.values()].sort((left, right) => left.ticker.localeCompare(right.ticker))) {
    if (boc.shares.get(line.ticker)?.suspended) {
      if (!(line.volume > 0)) {
        suspended.push({ ticker: line.ticker, name: line.name, reason: `SP (suspended) on the ${boc.bulletinDate} official bulletin` });
        continue;
      }
      resumed.push(line.ticker);
    }
    const isin = isins.get(line.ticker) || "";
    if (!isin) noIsin.push(line.ticker);
    rows.push({
      query: isin || line.ticker,
      ticker: line.ticker,
      name: line.name,
      exchange: "BRVM",
      mic: "XBRV",
      currency: "XOF",
      type: "STOCK",
      isin,
      raw: [line.ticker, line.name, isin, `close ${line.close || line.previous} XOF`, `session ${sheet.sessionDate}`].join(" | "),
    });
  }

  if (suspended.length > MAX_SUSPENDED) throw new Error(`${suspended.length} shares flagged suspended: the bulletin was misread`);
  if (rows.length < FLOOR - MAX_SUSPENDED) throw new Error(`only ${rows.length} BRVM shares`);
  for (const ticker of KNOWN) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);

  return {
    rows,
    suspended,
    resumed,
    noIsin,
    notOnBulletin,
    sessionDate: sheet.sessionDate,
    bulletinDate: boc.bulletinDate,
    bulletinUrl: boc.url,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const book = await brvmBook();
  const byType = {};
  for (const row of book.rows) byType[`BRVM ${row.type}`] = (byType[`BRVM ${row.type}`] || 0) + 1;
  console.error(
    `${book.rows.length} listings (price page ${book.sessionDate}, bulletin ${book.bulletinDate}): ${Object.entries(byType)
      .map(([key, value]) => `${key} ${value}`)
      .join(", ")}; ${book.rows.length - book.noIsin.length} ISINs.`
  );
  console.error(`Suspended, left out: ${book.suspended.map((line) => `${line.ticker} (${line.name})`).join(", ") || "none"}.`);
  if (book.resumed.length) console.error(`Flagged SP on the bulletin but traded since, kept: ${book.resumed.join(", ")}.`);
  if (book.noIsin.length) console.error(`No ISIN in assets/stocks.csv: ${book.noIsin.join(", ")}.`);
  if (book.notOnBulletin.length) console.error(`Not on the bulletin's share pages: ${book.notOnBulletin.join(", ")}.`);
}
