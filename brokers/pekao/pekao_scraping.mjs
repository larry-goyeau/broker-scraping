// Pekao publishes the foreign offer as two files. The 11 September 2026 list
// is the one the page calls the instruments in the offer. It mixes shares,
// ETFs, ETCs, ETNs, depositary receipts, REITs and bonds. Receipts and bonds
// stay out. A REIT stays a share. The short name is a Bloomberg code. The
// suffix names the place, except `US`, which is the country: the communiqué
// lists NYSE, NYSE Arca, Nasdaq and BATS, and the row does not say which.
// Those lines are stored as USA.
//
// The ETF / ETN / ETC file is the same offer with a type column. A line it
// has and the September list does not is kept. `ET` at the end of a short
// name is the word ETF cut by the column.
//
// `GR` and `GY` are Xetra. `GF` is Frankfurt. The venue annex names both.
// `AU` lines are ASX ISINs. Canada `CN` is Toronto.
//
// Warsaw is the other book. The cash-market page describes the share offer
// as the GPW board and NewConnect, including new issues, and publishes no
// exclusion. The ETF commission page points at the GPW list of ETF, ETC and
// ETN. GlobalConnect is not in that description. Bankier tags every Warsaw
// ETP as "etf"; the symbol prefix is the product.
//
//   https://www.pekao.com.pl/biuro-maklerskie/klient-indywidualny/aktywne-inwestowanie/rynki-zagraniczne.html
//   https://www.pekao.com.pl/biuro-maklerskie/klient-indywidualny/aktywne-inwestowanie/instrumenty-rynku-kasowego.html
//   https://www.gpw.pl/etfy
//
//   node brokers/pekao/pekao_scraping.mjs
//   node brokers/pekao/pekao_scraping.mjs --list=./lista.pdf --etf=./etf.pdf
//
// Text is read with PyMuPDF (`python3 -c "import fitz"`).

import { stampRows } from "../../accepted.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const PAGE = "https://www.pekao.com.pl/biuro-maklerskie/klient-indywidualny/aktywne-inwestowanie/rynki-zagraniczne.html";
const SHARE_BOARD = "https://www.bankier.pl/gielda/notowania/akcje";
const NC_BOARD = "https://www.bankier.pl/gielda/notowania/new-connect";
const ETF_BOARD = "https://www.bankier.pl/gielda/notowania/etf";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CCY = new Set(["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK"]);

// Bloomberg equity suffix to the place Pekao's annex names for that country.
const SUFFIX = {
  US: "USA",
  CN: "XTSE",
  AU: "XASX",
  GR: "XETR",
  GY: "XETR",
  GF: "XFRA",
  FP: "XPAR",
  NA: "XAMS",
  BB: "XBRU",
  SM: "XMAD",
  IM: "XMIL",
  LN: "XLON",
  LI: "XLON",
  LO: "XLON",
  SW: "XSWX",
  SS: "XSTO",
  NO: "XOSL",
  DC: "XCSE",
  FH: "XHEL",
  AV: "XWBO",
  PL: "XLIS",
  ID: "XDUB",
  GA: "XATH",
};

const PRODUCT = new Set(["ETF", "ETC", "ETN", "ETP", "ADR", "GDR", "REIT", "ET", "E", "DR"]);

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

function productOf(tags) {
  if (tags.includes("ADR") || tags.includes("GDR")) return "";
  if (tags.includes("ETN") || tags.includes("ETP")) return "ETN";
  if (tags.includes("ETC")) return "ETC";
  if (tags.includes("ETF") || tags.includes("ET") || tags.includes("E")) return "ETF";
  return "STOCK";
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
  const list = pathArg("list");
  const etf = pathArg("etf");
  if (list && etf) return { list, etf };
  const response = await fetch(PAGE, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`Pekao page answered ${response.status}`);
  const html = await response.text();
  const links = [...html.matchAll(/<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    href: new URL(match[1].replace(/&amp;/g, "&"), PAGE).href,
    text: normalize(match[2].replace(/<[^>]+>/g, " ")).toLowerCase(),
  }));
  const decoded = (href) => decodeURIComponent(href).toLowerCase();
  return {
    list: list || links.find((link) => /papierow/.test(decoded(link.href)) || /instrument/.test(link.text))?.href || "",
    etf: etf || links.find((link) => /etf/.test(link.text) && /etn/.test(link.text))?.href || "",
  };
}

async function pdfBytes(source) {
  if (source && !/^https?:/i.test(source)) return fs.readFileSync(source);
  const response = await fetch(source, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`Pekao PDF answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Pekao list URL did not return a PDF");
  return bytes;
}

function pdfLines(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz

doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
rows = []
for page in doc:
    words = sorted(page.get_text("words"), key=lambda w: (w[1], w[0]))
    current = []
    last = None
    for x0, y0, x1, y1, text, *_rest in words:
        text = text.strip()
        if not text:
            continue
        if last is not None and y0 - last > 2 and current:
            rows.append(current)
            current = []
        current.append({"x": x0, "text": text})
        last = y0
    if current:
        rows.append(current)
json.dump(rows, sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.status !== 0) {
    const detail = python.stderr?.toString() || "";
    throw new Error(
      detail.includes("No module named 'fitz'")
        ? "PyMuPDF is missing: pip install pymupdf"
        : `Could not read the PDF${detail ? `: ${detail.trim()}` : ""}`
    );
  }
  return JSON.parse(python.stdout.toString("utf8"));
}

const COUNTRY = new Set([
  "Niemcy", "Francja", "Wielka", "Brytania", "USA", "Kanada", "Australia", "Szwecja", "Norwegia",
  "Szwajcaria", "Holandia", "Włochy", "Dania", "Hiszpania", "Finlandia", "Austria", "Belgia",
  "Portugalia", "Grecja", "Irlandia",
]);

function titleWords(line, limit) {
  const words = line
    .filter((word) => word.x > 70 && word.x < limit)
    .map((word) => word.text);
  while (words.length && COUNTRY.has(words[words.length - 1])) words.pop();
  return words;
}

function mainListings(lines) {
  const results = [];
  const seen = new Set();
  const skipped = [];
  let pending = [];
  let last = null;
  let bonds = false;
  for (const line of lines) {
    if (line.some((word) => word.text === "Obligacje")) {
      bonds = true;
      pending = [];
      continue;
    }
    if (bonds) continue;
    const isinWord = line.find((word) => toIsin(word.text));
    if (!isinWord) {
      const bits = titleWords(line, 210);
      const bare = last && last.unnamed;
      if (bare && bits.length >= 2 && !/\b(ADR|GDR)\b/.test(bits.join(" "))) {
        last.name = normalize(bits.join(" "));
        last.raw = [last.ticker, last.name, last.exchange, last.currency, last.type].filter(Boolean).join(" ");
        delete last.unnamed;
        pending = [];
      } else if (bits.length) pending = bits;
      continue;
    }
    const isin = toIsin(isinWord.text);
    const ccyWord = line.find((word) => word.x > isinWord.x && word.x < 430 && CCY.has(word.text));
    if (!ccyWord) {
      pending = [];
      last = null;
      continue;
    }
    const own = titleWords(line, isinWord.x);
    const name = normalize((own.length ? own : pending).join(" "));
    pending = [];
    const short = line.filter((word) => word.x > isinWord.x && word.x < ccyWord.x).map((word) => word.text.toUpperCase());
    if (short.some((token) => token.includes("*")) || /\d{2}\/\d{2}\/\d{4}/.test(name)) {
      skipped.push(`${isin} bond`);
      last = null;
      continue;
    }
    if (/\b(ADR|GDR)\b/.test(name)) {
      skipped.push(`${isin} receipt`);
      last = null;
      continue;
    }
    const tags = [];
    while (short.length && PRODUCT.has(short[short.length - 1])) tags.push(short.pop());
    const suffix = short.length && SUFFIX[short[short.length - 1]] ? short.pop() : "";
    const exchange = SUFFIX[suffix] || "";
    const type = productOf(tags);
    const ticker = normalize(short.join(" "));
    if (!exchange || !type || !ticker) {
      skipped.push(`${isin} ${suffix || short.join(" ")} ${tags.join(" ")}`.trim());
      last = null;
      continue;
    }
    const key = `${isin}:${exchange}:${ccyWord.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    last = rowOf({ isin, ticker, name, exchange, currency: ccyWord.text, type });
    if (!name) last.unnamed = true;
    results.push(last);
  }
  for (const row of results) delete row.unnamed;
  return { results, skipped };
}

function shortOf(line) {
  const head = [];
  const tags = [];
  for (const word of line || []) {
    if (word.x < 160 || word.x > 250) continue;
    const token = word.text.toUpperCase();
    if (PRODUCT.has(token)) tags.push(token);
    else head.push(token);
  }
  return { head, tags };
}

function etfListings(lines, held) {
  const results = [];
  const seen = new Set(held);
  const skipped = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isinWord = line.find((word) => toIsin(word.text));
    if (!isinWord) continue;
    const isin = toIsin(isinWord.text);
    const own = shortOf(line);
    const above = shortOf(lines[index - 1]);
    const below = shortOf(lines[index + 1]);
    const head = own.head.some((token) => SUFFIX[token]) ? own.head : above.head;
    const tags = own.tags.length ? own.tags : below.tags;
    const suffix = [...head].reverse().find((token) => SUFFIX[token]) || "";
    const ticker = normalize(head.filter((token) => token !== suffix).join(" "));
    const ccy = line.find((word) => word.x > 400 && CCY.has(word.text))?.text || "";
    const nameBits = [lines[index - 1], line, lines[index + 1]]
      .filter(Boolean)
      .flat()
      .filter((word) => word.x > 250 && word.x < 420)
      .map((word) => word.text);
    const exchange = SUFFIX[suffix] || "";
    const type = productOf(tags);
    const name = normalize(nameBits.join(" "));
    if (!exchange || !ccy || !type || !ticker) {
      skipped.push(`${isin} ${suffix} ${tags.join(" ")}`.trim());
      continue;
    }
    if (/\b(ADR|GDR)\b/.test(name)) {
      skipped.push(`${isin} receipt`);
      continue;
    }
    if (seen.has(isin)) continue;
    seen.add(isin);
    results.push(rowOf({ isin, ticker, name, exchange, currency: ccy, type }));
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

const urls = await catalogueUrls();
if (!urls.list || !urls.etf) throw new Error("Pekao page did not link the instrument list and the ETF list");
const [listLines, etfLines] = await Promise.all([
  pdfBytes(urls.list).then(pdfLines),
  pdfBytes(urls.etf).then(pdfLines),
]);
const listed = mainListings(listLines);
const extra = etfListings(etfLines, new Set(listed.results.map((row) => row.isin)));
const fromPdf = [...listed.results, ...extra.results];
const pdfByType = new Map();
for (const row of fromPdf) pdfByType.set(row.type, (pdfByType.get(row.type) || 0) + 1);
console.error(
  `PDF ${fromPdf.length} (${[...pdfByType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"}), ETF file added ${extra.results.length}` +
    (extra.results.length ? `: ${extra.results.map((row) => `${row.ticker} ${row.isin}`).join(", ")}` : "")
);
const skipped = [...listed.skipped, ...extra.skipped];
if (skipped.length) console.error(`PDF skipped ${skipped.length}: ${skipped.slice(0, 8).join(" | ")}`);

const seen = new Set(fromPdf.map((row) => `${row.isin}:${row.exchange}:${row.currency}`));
const results = [...fromPdf];
let warsaw = 0;
for (const row of await warsawRows()) {
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
const outputPath = new URL("pekao-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(stampRows(results), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const warsawByType = new Map();
for (const row of results.filter((row) => row.exchange === "GPW" || row.exchange === "NewConnect")) {
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
