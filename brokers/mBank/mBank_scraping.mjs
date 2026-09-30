// mBank eMakler publishes one file for the foreign book and for every ETF,
// ETC and ETN it will accept, including the Warsaw funds named in it. The
// cover says an order is executed only for a share or an ETF from that file.
// US-listed ETFs are absent: they are not offered to retail clients.
//
// Warsaw shares are not in the file. eMakler takes the main GPW board and
// NewConnect. It refuses the quotation class in § 71 point 5 and § 72 (1a)
// of the GPW rules: Regulation S category 3 and Rule 144A. Those names are
// marked REGS or S144 on the boards, and the exchange lists them at
// https://www.gpw.pl/spolki-regulacja-s
//
// ADR/GDR lines, bonds and the warrant stay out. A footnote on AKCJA is a
// tax mark; the line is still a share.
//
//   https://www.mbank.pl/pdf/ind/inwestycje/lista-akcji-zagranicznych.pdf
//   https://www.mbank.pl/indywidualny/inwestycje/pytania-i-odpowiedzi/tabela-funkcjonalnosci-emakler/
//
//   node brokers/mBank/mBank_scraping.mjs
//   node brokers/mBank/mBank_scraping.mjs --pdf=./list.pdf
//
// Text is read with PyMuPDF (`python3 -c "import fitz"`).

import { stampRows } from "../../accepted.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const LIST = "https://www.mbank.pl/pdf/ind/inwestycje/lista-akcji-zagranicznych.pdf";
const SHARE_BOARD = "https://www.bankier.pl/gielda/notowania/akcje";
const NC_BOARD = "https://www.bankier.pl/gielda/notowania/new-connect";
const REGS = "https://www.gpw.pl/spolki-regulacja-s";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MARKETS = new Map([
  ["DEU-XETRA", "XETR"],
  ["GBR-LSE", "XLON"],
  ["USA-NYSE", "XNYS"],
  ["USA-NASDAQ", "XNAS"],
  ["GPW-WWA", "GPW"],
]);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function tickerToken(value) {
  const text = normalize(value).toUpperCase();
  if (!text || text === "-") return "";
  return /^[A-Z0-9][A-Z0-9./]{0,24}$/.test(text) ? text : "";
}

function pathArg(flag) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return "";
}

function productType(token) {
  const text = normalize(token).toUpperCase();
  if (/^AKCJA(?: \d+\))?$/.test(text)) return "STOCK";
  if (text === "ETF" || text === "ETC" || text === "ETN" || text === "ETP") return text;
  return "";
}

function column(x) {
  if (x < 190) return "venue";
  if (x < 250) return "market";
  if (x < 410) return "name";
  if (x < 500) return "service";
  if (x < 575) return "bloom";
  if (x < 625) return "google";
  if (x < 690) return "isin";
  return "type";
}

async function pdfBytes() {
  const local = pathArg("pdf");
  if (local) return fs.readFileSync(local);
  const page = await fetch(LIST, { headers: { "User-Agent": UA } });
  if (!page.ok) throw new Error(`mBank list page answered ${page.status}`);
  const bytes = Buffer.from(await page.arrayBuffer());
  if (bytes.subarray(0, 5).toString() === "%PDF-") return bytes;
  const html = bytes.toString("utf8");
  const refresh = html.match(/url=([^"'>\s]+)/i)?.[1];
  if (!refresh) throw new Error("mBank list page had no PDF");
  const file = await fetch(refresh, { headers: { "User-Agent": UA } });
  if (!file.ok) throw new Error(`mBank PDF answered ${file.status}`);
  const pdf = Buffer.from(await file.arrayBuffer());
  if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("mBank list URL did not return a PDF");
  return pdf;
}

function pdfRows(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz

doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
words = []
for page_no, page in enumerate(doc):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if text:
                words.append((page_no, line["bbox"][1], line["bbox"][0], text))
words.sort()
rows = []
current = []
last = None
for page_no, y, x, text in words:
    if last is not None and (page_no != last[0] or y - last[1] > 8) and current:
        rows.append(current)
        current = []
    current.append({"x": x, "text": text})
    last = (page_no, y)
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

function listingsFrom(rows) {
  const results = [];
  const seen = new Set();
  for (const row of rows) {
    const buckets = {
      venue: [],
      market: [],
      name: [],
      service: [],
      bloom: [],
      google: [],
      isin: [],
      type: [],
    };
    for (const word of row) {
      if (word.x < 80) continue;
      buckets[column(word.x)].push(word.text);
    }
    const isin = buckets.isin.map(toIsin).find(Boolean) || "";
    const type = productType(buckets.type.join(" "));
    const market = buckets.market.map((part) => normalize(part)).find((part) => MARKETS.has(part)) || "";
    const currency = buckets.venue.join(" ").match(/\(([A-Z]{3})\)/)?.[1] || "";
    if (!isin || !type || !market || !currency) continue;
    const bloom = buckets.bloom.map((part) => part.trim()).filter(Boolean).join("");
    const ticker =
      tickerToken(buckets.google.join("")) ||
      tickerToken(buckets.service.join(" ")) ||
      tickerToken(bloom.split(":")[0]);
    if (!ticker) continue;
    const exchange = MARKETS.get(market);
    const name = normalize(buckets.name.join(" "));
    const key = `${isin}:${exchange}:${ticker}:${currency}:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      query: isin,
      ticker,
      name: name || ticker,
      exchange,
      currency,
      type,
      raw: [ticker, name, market, currency, type].filter(Boolean).join(" "),
      isin,
    });
  }
  return results;
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

function refusedSymbol(symbol) {
  return /REGS|S144|\/18$|\/19$/i.test(symbol);
}

async function refusedIsins() {
  let last = "fetch failed";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(REGS, { headers: { "User-Agent": UA, Accept: "text/html" } });
      if (!response.ok) throw new Error(String(response.status));
      const html = await response.text();
      return new Set([...html.matchAll(/isin=([A-Z0-9]{12})/g)].map((match) => match[1]));
    } catch (error) {
      last = error.message;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  console.error(`GPW Regulation S page did not answer (${last}); ticker suffixes still apply`);
  return new Set();
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

function profileRow(html, symbol, exchange) {
  const isin = toIsin(html.match(/data-isin="([^"]+)"/)?.[1]);
  const unit = html.match(/data-unit="([^"]+)"/)?.[1] ?? "";
  if (!isin || unit !== "zł") return null;
  const suffix = normalize(html.match(/a-heading__suffix[^"]*">([^<]+)/)?.[1]);
  const wrapped = suffix.match(/^(.*)\(([^)]+)\)\s*$/);
  const ticker = tickerToken(wrapped ? wrapped[2] : symbol);
  const name = normalize(wrapped ? wrapped[1] : suffix);
  if (!ticker || refusedSymbol(ticker) || refusedSymbol(suffix)) return null;
  return {
    query: isin,
    ticker,
    name: name || ticker,
    exchange,
    currency: "PLN",
    type: "STOCK",
    raw: [ticker, name, exchange, "PLN", "STOCK"].filter(Boolean).join(" "),
    isin,
  };
}

async function warsawShares(refused) {
  const [sharesPage, ncPage] = await Promise.all([
    fetch(SHARE_BOARD, { headers: { "user-agent": UA } }),
    fetch(NC_BOARD, { headers: { "user-agent": UA } }),
  ]);
  if (!sharesPage.ok) throw new Error(`GPW share board answered ${sharesPage.status}`);
  if (!ncPage.ok) throw new Error(`NewConnect board answered ${ncPage.status}`);
  const [sharesHtml, ncHtml] = await Promise.all([sharesPage.text(), ncPage.text()]);
  const jobs = [
    ...boardSymbols(sharesHtml).map((symbol) => ({ symbol, exchange: "GPW" })),
    ...boardSymbols(ncHtml).map((symbol) => ({ symbol, exchange: "NewConnect" })),
  ].filter((job) => !refusedSymbol(job.symbol));
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      const html = await profileHead(job.symbol);
      const row = profileRow(html, job.symbol, job.exchange);
      if (!row || refused.has(row.isin)) continue;
      rows.push(row);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  return rows;
}

const bytes = await pdfBytes();
const fromPdf = listingsFrom(pdfRows(bytes));
const pdfByType = new Map();
for (const row of fromPdf) pdfByType.set(row.type, (pdfByType.get(row.type) || 0) + 1);
console.error(
  `PDF ${fromPdf.length} (${[...pdfByType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})`
);
const refused = await refusedIsins();
const seen = new Set(fromPdf.map((row) => `${row.isin}:${row.exchange}:${row.currency}`));
const results = [...fromPdf];
let warsaw = 0;
for (const row of await warsawShares(refused)) {
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
const outputPath = new URL("mBank-parsed.json", import.meta.url);
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
  `Warsaw ${warsaw} shares added. On the book: ` +
    `${[...warsawByType].map(([label, count]) => `${count} ${label}`).join(", ") || "none"}`
);
