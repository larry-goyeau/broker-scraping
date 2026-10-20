// What Al Sharq Financial Brokerage sells in shares, with no login. Sharq
// deals on Boursa Kuwait alone, and two pages of its own site name the book
// between them. The homepage price ticker asks the broker's API for every
// sector of the board and prints each line as ticker and price; it drops a
// line that has not been quoted lately. The daily "market capitalization of
// listed companies" PDF lists every listed company by Boursa code and ticker,
// and leaves out the newest listings whose share count it has not filed yet.
// The union of the two is the book; a ticker that both name is one line.
//
// Neither prints a name or an ISIN. Both are copied from stocks.csv when the
// ticker on KSE names a single ISIN (GFH and the other cross-listings keep
// their home ISIN); a ticker with no such line keeps itself as its name.
// Boursa Kuwait lists no ETF. Baitak REIT is a real estate fund, not a share
// or an ETF, and is left out. Sukuk and bonds trade off this board.
//
//   https://www.sharqetrade.com/en
//   POST https://www.sharqetrade.com/Controllers/Ajax.aspx/GetPriceTickerHTML {"Language":"en","SectorId":"0"}
//   https://www.sharqetrade.com/en/trading-services/market-capitalization-of-listed-companies
//     → /media/<id>/market-value-english-<dd-mm-yyyy>.pdf
//
// The PDF is read with PyMuPDF (pip install pymupdf), as Boubyan's lists are.
//
//   node brokers/sharq/sharq_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const SITE = "https://www.sharqetrade.com";
const TICKER = `${SITE}/Controllers/Ajax.aspx/GetPriceTickerHTML`;
const MCAP_PAGE = `${SITE}/en/trading-services/market-capitalization-of-listed-companies`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EXCHANGE = "Boursa Kuwait";
const MIC = "XKUW";
const FLOOR = { ticker: 120, pdf: 110, book: 125 };
// The PDF is dated in its titles; one older than this is not today's book.
const PDF_MAX_AGE_DAYS = 14;
const FUNDS = new Set(["BAITAKREIT"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchRetry(url, init = {}, { binary = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, Referer: `${SITE}/en`, ...(init.headers || {}) },
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const decode = (text) =>
  String(text ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/ /g, " ");
const clean = (value) => decode(value).replace(/\s+/g, " ").trim();

// The ticker is a run of <li>: a sector title, then one <li> of
// "TICKER price<em>change</em>" items for that sector.
async function tickerBook() {
  const body = JSON.parse(
    await fetchRetry(TICKER, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
      body: JSON.stringify({ Language: "en", SectorId: "0" }),
    })
  );
  const html = decode(body?.d || "");
  const lines = new Map();
  let sector = "";
  for (const [, cls, inner] of html.matchAll(/<li(?:\s+class='([^']*)')?>([\s\S]*?)<\/li>/g)) {
    if (cls === "sector-title") {
      sector = clean(inner.replace(/<[^>]+>/g, " ")).replace(/^-+\s*|\s*-+$/g, "");
      continue;
    }
    if (cls) throw new Error(`the ticker has an unknown item class: ${cls}`);
    if (!sector) throw new Error("the ticker lists symbols before any sector");
    const text = clean(inner.replace(/<em[\s\S]*?<\/em>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\(\s*0\s*\)/g, " ");
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length % 2) throw new Error(`unreadable ticker run in ${sector}: ${text.slice(0, 120)}`);
    for (let i = 0; i < tokens.length; i += 2) {
      const ticker = tokens[i].toUpperCase();
      const price = tokens[i + 1];
      if (!/^[A-Z][A-Z0-9]{1,14}$/.test(ticker) || !/^\d[\d.,]*$/.test(price)) {
        throw new Error(`unreadable ticker item in ${sector}: ${tokens[i]} ${price}`);
      }
      if (lines.has(ticker)) throw new Error(`${ticker} repeats in the ticker`);
      lines.set(ticker, { ticker, sector });
    }
  }
  return lines;
}

function pdfText(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz
doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
json.dump([[l.strip() for l in page.get_text().split("\\n") if l.strip()] for page in doc], sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.error || python.status !== 0) {
    const detail = python.stderr?.toString() || python.error?.message || "";
    throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : detail.slice(0, 400));
  }
  return JSON.parse(python.stdout.toString());
}

// Each table row reads, one cell a line: rank, Boursa code, ticker, capital,
// last, shares, market cap, ratio. The first page is a top-fifteen extract
// of the same companies.
async function pdfBook() {
  const page = await fetchRetry(MCAP_PAGE);
  const links = [...new Set([...page.matchAll(/href="([^"]*market-value-english[^"]*\.pdf)"/gi)].map((m) => new URL(m[1], SITE).href))];
  if (links.length !== 1) throw new Error(`the market-capitalization page links ${links.length} English PDFs`);
  const bytes = await fetchRetry(links[0], { headers: { Accept: "application/pdf" } }, { binary: true });
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${links[0]} did not return a PDF`);
  const pages = pdfText(bytes);

  const dates = [...pages.flat().join("\n").matchAll(/Listed Companies on (\d{2})\/(\d{2})\/(\d{4})/gi)];
  if (!dates.length) throw new Error("the PDF names no date");
  const [, dd, mm, yyyy] = dates[0];
  const age = (Date.now() - Date.UTC(+yyyy, +mm - 1, +dd)) / 86400000;
  if (age > PDF_MAX_AGE_DAYS) throw new Error(`the PDF is dated ${dd}/${mm}/${yyyy}`);

  const lines = new Map();
  for (const [index, cells] of pages.entries()) {
    for (let i = 0; i + 4 < cells.length; i += 1) {
      if (!/^\d{1,3}$/.test(cells[i]) || !/^\d{3,4}$/.test(cells[i + 1])) continue;
      if (!/^[A-Za-z][A-Za-z0-9]{1,14}$/.test(cells[i + 2]) || !/^[\d,]+$/.test(cells[i + 3])) continue;
      const ticker = cells[i + 2].toUpperCase();
      const code = cells[i + 1];
      const before = lines.get(ticker);
      if (before && before.code !== code) throw new Error(`${ticker} has codes ${before.code} and ${code}`);
      if (index > 0 || !before) lines.set(ticker, { ticker, code });
    }
  }
  return { lines, url: links[0], date: `${yyyy}-${mm}-${dd}` };
}

// stocks.csv files Boursa Kuwait as KSE. A ticker that names exactly one
// ISIN there is that line.
function kseCatalogue() {
  const found = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/)) {
    const match = line.match(/^KSE:([^,]+),KSE,([A-Z]{2}[A-Z0-9]{9}\d),(.*)$/);
    if (!match) continue;
    const ticker = match[1].trim().toUpperCase();
    const name = match[3].replace(/^"|"$/g, "").trim();
    if (!found.has(ticker)) found.set(ticker, []);
    found.get(ticker).push({ isin: match[2], name });
  }
  return found;
}

const ticker = await tickerBook();
const pdf = await pdfBook();
if (ticker.size < FLOOR.ticker) throw new Error(`the price ticker has only ${ticker.size} symbols`);
if (pdf.lines.size < FLOOR.pdf) throw new Error(`the PDF has only ${pdf.lines.size} companies`);

const catalogue = kseCatalogue();
const leftOut = new Map();
const rows = [];
let both = 0;
for (const code of [...new Set([...ticker.keys(), ...pdf.lines.keys()])].sort()) {
  if (FUNDS.has(code)) {
    leftOut.set("real estate fund", (leftOut.get("real estate fund") || 0) + 1);
    continue;
  }
  const quoted = ticker.get(code);
  const listed = pdf.lines.get(code);
  if (quoted && listed) both += 1;
  const known = catalogue.get(code);
  const hit = known?.length === 1 ? known[0] : null;
  rows.push({
    query: hit?.isin || code,
    ticker: code,
    name: hit?.name || code,
    exchange: EXCHANGE,
    mic: MIC,
    currency: "KWD",
    type: "STOCK",
    ...(hit ? { isin: hit.isin } : {}),
    raw: [code, listed?.code, quoted?.sector, EXCHANGE].filter(Boolean).join(" "),
  });
}
if (rows.length < FLOOR.book) throw new Error(`only ${rows.length} Boursa Kuwait shares`);

fs.writeFileSync(new URL("sharq-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const withIsin = rows.filter((row) => row.isin).length;
const skipped = [...leftOut].map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `${rows.length} listings: ${EXCHANGE} STOCK ${rows.length} (ticker ${ticker.size}, PDF ${pdf.lines.size} of ${pdf.date}, both ${both}); ` +
    `${withIsin} ISINs. Left out: ${skipped || "none"}.`
);
