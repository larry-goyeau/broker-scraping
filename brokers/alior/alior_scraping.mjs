// Alior publishes the foreign offer as two workbooks, the same list as the
// communiqué of 21 September 2026 (in force 22 September). Each row has the
// ISIN, the exchange, the currency and a type. Akcje and REIT stay shares.
// ADR stays out, including a share row whose name says ADR. A row marked
// "tylko sprzedaż", or with no exchange, stays out. The CBOE column is the
// quote display. The quotation symbol ends with that book's letter; the
// letter is not part of the ticker.
//
// Warsaw is the other book. The account page points at the GPW share list,
// the NewConnect company list and the GPW ETF list, and the 30 June 2026
// communiqué prices every ETF, ETC and ETN listed on the Warsaw exchange.
// Bankier tags every Warsaw ETP as "etf"; the symbol prefix is the product.
// GlobalConnect is named on the same page. Bankier prints those names and
// not the ISIN, and the exchange site is read when it answers.
//
//   https://www.aliorbank.pl/biuro-maklerskie/gielda/rynki-zagraniczne.html
//   https://www.aliorbank.pl/biuro-maklerskie/gielda/rachunek-brokerski.html
//   https://www.gpw.pl/etfy
//
//   node brokers/alior/alior_scraping.mjs
//   node brokers/alior/alior_scraping.mjs --shares=./akcje.xlsx --etf=./etf.xlsx
//
// The workbooks are read with Python's zipfile. Warsaw profiles come from Bankier.

import { stampRows } from "../../accepted.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const PAGE = "https://www.aliorbank.pl/biuro-maklerskie/gielda/rynki-zagraniczne.html";
const SHARE_BOARD = "https://www.bankier.pl/gielda/notowania/akcje";
const NC_BOARD = "https://www.bankier.pl/gielda/notowania/new-connect";
const ETF_BOARD = "https://www.bankier.pl/gielda/notowania/etf";
const GC_BOARD = "https://www.bankier.pl/gielda/notowania/global-connect";
const GC_PAGE = "https://gpwglobalconnect.pl/spolki";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const EXCHANGE = {
  "NYSE (New York Stock Exchange)": "XNYS",
  NASDAQ: "XNAS",
  "LSE (London Stock Exchange)": "XLON",
  "XETRA (Deutsche Borse)": "XETR",
  "Euronext Paryż": "XPAR",
  "Euronext Amsterdam": "XAMS",
  "Euronext Bruksela": "XBRU",
  "Euronext Lizbona": "XLIS",
  "Borsa Italiana": "XMIL",
  "Bolsa de Madrid": "XMAD",
  "Oslo Stock Exchange": "XOSL",
  "NASDAQ OMX Stockholm": "XSTO",
  "NASDAQ OMX Copenhagen": "XCSE",
  "NASDAQ OMX Helsinki": "XHEL",
};

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
rows = []
for row in root.findall("m:sheetData/m:row", NS):
    values = []
    for cell in row.findall("m:c", NS):
        node = cell.find("m:v", NS)
        if node is None or node.text is None:
            values.append("")
        elif cell.get("t") == "s":
            values.append(shared[int(node.text)])
        else:
            values.append(node.text)
    if values and len(values[0]) == 12:
        rows.append({
            "isin": values[0],
            "name": values[1] if len(values) > 1 else "",
            "exchange": values[2] if len(values) > 2 else "",
            "currency": values[3] if len(values) > 3 else "",
            "ticker": values[4] if len(values) > 4 else "",
            "type": values[7] if len(values) > 7 else "",
        })
json.dump(rows, sys.stdout)
`;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function pathArg(flag) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return "";
}

function tickerOf(value) {
  const text = normalize(value).replace(/\*+$/g, "");
  const marked = text.match(/^(.*[A-Z0-9.])([a-z])$/);
  return (marked ? marked[1] : text).toUpperCase();
}

function rowOf({ isin, ticker, name, exchange, currency, type }) {
  return {
    query: isin,
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, type].filter(Boolean).join(" "),
    isin,
  };
}

async function catalogueUrls() {
  const shares = pathArg("shares");
  const etf = pathArg("etf");
  if (shares && etf) return { shares, etf };
  const response = await fetch(PAGE, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`Alior page answered ${response.status}`);
  const html = await response.text();
  const links = [...html.matchAll(/href="([^"]+\.xlsx[^"]*)"/gi)].map((match) =>
    decodeURIComponent(new URL(match[1].replace(/&amp;/g, "&"), PAGE).href)
  );
  const full = (kind) => links.find((href) => new RegExp(`Instrumenty-RZ-${kind}(?:\\(\\d+\\))?\\.xlsx$`, "i").test(href)) || "";
  return { shares: shares || full("akcje"), etf: etf || full("etf") };
}

async function workbookBytes(source) {
  if (source && !/^https?:/i.test(source)) return fs.readFileSync(source);
  const response = await fetch(source, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`Alior workbook answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 2).toString() !== "PK") throw new Error("Alior list URL did not return a workbook");
  return bytes;
}

function workbookRows(bytes) {
  const run = spawnSync("python3", ["-c", XLSX_TO_JSON], { input: bytes, maxBuffer: 32_000_000 });
  if (run.status !== 0) throw new Error(run.stderr.toString() || "the workbook could not be read");
  return JSON.parse(run.stdout.toString());
}

function foreignRows(entries) {
  const results = [];
  const skipped = [];
  const seen = new Set();
  for (const entry of entries) {
    const isin = toIsin(entry.isin);
    const name = normalize(entry.name);
    const exchange = EXCHANGE[normalize(entry.exchange)] || "";
    const currency = normalize(entry.currency).toUpperCase();
    const ticker = tickerOf(entry.ticker);
    const label = normalize(entry.type);
    if (!isin) continue;
    if (/tylko sprzedaż/i.test(name) || normalize(entry.exchange) === "-") {
      skipped.push(`${isin} sell only`);
      continue;
    }
    if (label === "ADR" || /\b(ADR|GDR)\b/.test(name)) {
      skipped.push(`${isin} receipt`);
      continue;
    }
    const type = label === "ETF" || label === "ETC" || label === "ETN" ? label : label === "Akcje" || label === "REIT" ? "STOCK" : "";
    if (!type || !exchange || !currency || !ticker) {
      skipped.push(`${isin} ${label || "untyped"} ${normalize(entry.exchange) || "no place"}`);
      continue;
    }
    const key = `${isin}:${exchange}:${currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(rowOf({ isin, ticker, name, exchange, currency, type }));
  }
  return { results, skipped };
}

function boardSymbols(html) {
  const body = html.split("<tbody>").at(-1)?.split("</tbody>")[0] ?? "";
  const symbols = [];
  const seen = new Set();
  for (const match of body.matchAll(/quote\.html\?symbol=([^"&]+)/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    symbols.push(match[1]);
  }
  return symbols;
}

function warsawProduct(ticker) {
  if (/^ETC/i.test(ticker)) return "ETC";
  if (/^ETN/i.test(ticker)) return "ETN";
  return "ETF";
}

async function profileHead(symbol) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try {
      response = await fetch(
        `https://www.bankier.pl/inwestowanie/profile/quote.html?symbol=${encodeURIComponent(symbol)}`,
        { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) }
      );
    } catch (error) {
      last = `${symbol} profile ${error.message}`;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      last = `${symbol} profile answered ${response.status}`;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      continue;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    let html = "";
    while (size < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      html = Buffer.concat(chunks).toString("utf8");
      if (html.includes("data-isin=") && html.includes("data-unit=") && html.includes("a-heading__suffix")) break;
    }
    await reader.cancel();
    return html;
  }
  throw new Error(last || `${symbol} profile did not answer`);
}

function profileRow(html, symbol, exchange, type) {
  const isin = toIsin(html.match(/data-isin="([^"]+)"/)?.[1]);
  const unit = html.match(/data-unit="([^"]+)"/)?.[1] ?? "";
  if (!isin || unit !== "zł") return null;
  const suffix = normalize(html.match(/a-heading__suffix[^"]*">([^<]+)/)?.[1]);
  const wrapped = suffix.match(/^(.*)\(([^)]+)\)\s*$/);
  const ticker = normalize(wrapped ? wrapped[2] : symbol).toUpperCase();
  const name = normalize(wrapped ? wrapped[1] : suffix);
  if (!ticker) return null;
  return rowOf({ isin, ticker, name, exchange, currency: "PLN", type });
}

async function warsawRows() {
  const [sharesPage, ncPage, etfPage] = await Promise.all([
    fetch(SHARE_BOARD, { headers: { "user-agent": UA } }),
    fetch(NC_BOARD, { headers: { "user-agent": UA } }),
    fetch(ETF_BOARD, { headers: { "user-agent": UA } }),
  ]);
  if (!sharesPage.ok) throw new Error(`GPW share board answered ${sharesPage.status}`);
  if (!ncPage.ok) throw new Error(`NewConnect board answered ${ncPage.status}`);
  if (!etfPage.ok) throw new Error(`GPW ETF board answered ${etfPage.status}`);
  const [sharesHtml, ncHtml, etfHtml] = await Promise.all([sharesPage.text(), ncPage.text(), etfPage.text()]);
  const jobs = [
    ...boardSymbols(sharesHtml).map((symbol) => ({ symbol, exchange: "GPW", type: "STOCK" })),
    ...boardSymbols(ncHtml).map((symbol) => ({ symbol, exchange: "NewConnect", type: "STOCK" })),
    ...boardSymbols(etfHtml).map((symbol) => ({ symbol, exchange: "GPW", type: warsawProduct(symbol) })),
  ];
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      const html = await profileHead(job.symbol);
      const row = profileRow(html, job.symbol, job.exchange, job.type);
      if (row) rows.push(row);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  return rows;
}

function globalConnectNames(html) {
  const body = html.split("<tbody>")[1]?.split("</tbody>")[0] ?? "";
  return [...body.matchAll(/<tr[^>]*>\s*<td>([^<]+)<\/td>/g)].map((match) => normalize(match[1])).filter(Boolean);
}

async function globalConnectRows() {
  const board = await fetch(GC_BOARD, { headers: { "user-agent": UA } });
  if (!board.ok) throw new Error(`GlobalConnect board answered ${board.status}`);
  const names = globalConnectNames(await board.text());
  let page = "";
  try {
    const response = await fetch(GC_PAGE, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (response.ok) page = await response.text();
  } catch {
    page = "";
  }
  const results = [];
  if (!page) {
    console.error(`GlobalConnect ${names.length} names on Bankier, ${GC_PAGE} did not answer, no ISIN written`);
    return results;
  }
  for (const name of [...new Set(names)]) {
    const needle = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const near = page.match(new RegExp(`${needle}[\\s\\S]{0,400}?\\b([A-Z]{2}[A-Z0-9]{9}\\d)\\b|\\b([A-Z]{2}[A-Z0-9]{9}\\d)\\b[\\s\\S]{0,400}?${needle}`, "i"));
    const isin = toIsin(near?.[1] || near?.[2]);
    if (!isin) continue;
    results.push(rowOf({ isin, ticker: name.toUpperCase(), name, exchange: "GlobalConnect", currency: "PLN", type: /^ETF/i.test(name) ? "ETF" : "STOCK" }));
  }
  const missed = names.filter((name) => !results.some((row) => row.name === name));
  if (missed.length) console.error(`GlobalConnect without an ISIN: ${missed.join(", ")}`);
  return results;
}

const urls = await catalogueUrls();
if (!urls.shares || !urls.etf) throw new Error("Alior page did not link the share workbook and the ETF workbook");
const [shareEntries, etfEntries] = await Promise.all([
  workbookBytes(urls.shares).then(workbookRows),
  workbookBytes(urls.etf).then(workbookRows),
]);
const listed = foreignRows([...shareEntries, ...etfEntries]);
const byForeign = new Map();
for (const row of listed.results) byForeign.set(row.type, (byForeign.get(row.type) || 0) + 1);
console.error(`Workbooks ${listed.results.length} (${[...byForeign].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})`);
if (listed.skipped.length) console.error(`Workbooks skipped ${listed.skipped.length}: ${listed.skipped.slice(0, 8).join(" | ")}`);

const seen = new Set(listed.results.map((row) => `${row.isin}:${row.exchange}:${row.currency}`));
const results = [...listed.results];
let warsaw = 0;
for (const row of [...(await warsawRows()), ...(await globalConnectRows())]) {
  const key = `${row.isin}:${row.exchange}:${row.currency}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push(row);
  warsaw += 1;
}
results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});
const outputPath = new URL("alior-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(stampRows(results), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const warsawByType = new Map();
for (const row of results.filter((row) => row.exchange === "GPW" || row.exchange === "NewConnect" || row.exchange === "GlobalConnect")) {
  warsawByType.set(`${row.exchange} ${row.type}`, (warsawByType.get(`${row.exchange} ${row.type}`) || 0) + 1);
}
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})`
);
console.error(
  `Warsaw ${warsaw} added. On the book: ` +
    `${[...warsawByType].map(([label, count]) => `${count} ${label}`).join(", ") || "none"}`
);
