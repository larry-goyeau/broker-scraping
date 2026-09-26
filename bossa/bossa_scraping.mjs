// DM BOŚ publishes the foreign book as one PDF, linked from
// https://bossa.pl/oferta/rynek-zagraniczny/kid
// ("Lista wszystkich instrumentów zagranicznych"). Each row is a venue,
// an ISIN, a symbol, a name, a listing currency and a kind.
//
// The same page also loads a live ETP table from /export/kid-abroad.
// That table is ahead of the PDF: each row has a symbol, a venue, a
// currency, a fee and a KID. Rows whose ISIN, venue and currency are
// not already in the PDF are taken from the table.
//
// Warsaw shares are not in either file. Their mail says every name
// quoted on the WSE in PLN is offered, and that they do not hand out
// that list. Those rows come from Bankier's GPW share board, and only
// where the quote is in zlotys.
//
//   node bossa/bossa_scraping.mjs
//   node bossa/bossa_scraping.mjs --pdf=./Lista.pdf
//
// Text is read with PyMuPDF (`python3 -c "import fitz"`).

import { stampRows } from "../accepted.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const PAGE = "https://bossa.pl/oferta/rynek-zagraniczny/kid";

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(text)) return "";
  return text;
}

function pathArg(flag) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return "";
}

// The PDF repeats a short tape name on a row, then drops it while the tape
// stays the same. PAR / AMS / BRU are one Euronext book in this catalogue.
const MARKETS = new Map([
  ["Xetra", "XETR"],
  ["LSE", "LSE"],
  ["NSQ", "NASDAQ"],
  ["NYSE", "NYSE"],
  ["NYSE-MKT", "AMEX"],
  ["TSX", "TSX"],
  ["PAR", "EURONEXT"],
  ["AMS", "EURONEXT"],
  ["BRU", "EURONEXT"],
  ["SWX", "SIX"],
]);

const CURRENCIES = new Set(["EUR", "USD", "GBP", "GBX", "CHF", "CAD", "PLN", "SEK", "NOK", "DKK"]);

const KINDS = new Map([
  ["Akcje", "STOCK"],
  ["ADR", "STOCK"],
  ["ADS", "STOCK"],
  ["GDR", "STOCK"],
  ["REIT", "STOCK"],
  ["ETF", "ETF"],
  ["ETC", "ETC"],
  ["ETN", "ETN"],
  ["ETP", "ETP"],
]);

async function pdfBytes() {
  const local = pathArg("pdf");
  if (local) return fs.readFileSync(local);
  const page = await fetch(PAGE);
  if (!page.ok) throw new Error(`Bossa list page answered ${page.status}`);
  const html = await page.text();
  const hrefs = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((match) => match[1]);
  const list = hrefs.find((href) => /instrumentow_zagranicznych/i.test(href));
  if (!list) throw new Error("The foreign-instrument PDF link is not on the page");
  const url = new URL(list, PAGE).href;
  console.error(url);
  const file = await fetch(url);
  if (!file.ok) throw new Error(`Bossa PDF answered ${file.status}`);
  return Buffer.from(await file.arrayBuffer());
}

// A symbol or a name can sit on the line above and below the row, so plain
// reading order mixes those fragments into the next field. Rows are the
// words whose baselines are within a few points of each other.
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
  let market = "";

  for (const row of rows) {
    const words = [...row].sort((left, right) => left.x - right.x);
    const kind = words.at(-1)?.text;
    const currency = words.at(-2)?.text.toUpperCase();
    if (!KINDS.has(kind) || !CURRENCIES.has(currency)) continue;

    const isinAt = words.findIndex((word) => toIsin(word.text));
    if (isinAt < 0) continue;
    const isin = toIsin(words[isinAt].text);
    const tape = words[isinAt - 1]?.text;
    if (MARKETS.has(tape)) market = tape;
    if (!market) continue;

    // The symbol can wrap onto a second line in the same column. The name
    // starts after the gap that separates that column from the next one.
    const middle = words.slice(isinAt + 1, -2);
    const tickerWords = [];
    let nameAt = 0;
    for (const word of middle) {
      const previous = tickerWords.at(-1);
      if (previous && word.x - previous.x > 20) break;
      tickerWords.push(word);
      nameAt += 1;
    }
    // On the tighter pages the symbol and the name share one text run
    // ("AGAC-USD iShares Core …"). The symbol is the first token.
    const tickerText = tickerWords.map((word) => word.text).join("");
    const [tickerToken, ...tickerRest] = tickerText.split(/\s+/);
    const ticker = normalize(tickerToken).toUpperCase();
    const name = normalize(
      [...tickerRest, ...middle.slice(nameAt).map((word) => word.text)].join(" ")
    );
    if (!ticker) continue;

    const exchange = MARKETS.get(market);
    const type = KINDS.get(kind);
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
      raw: [ticker, name, market, currency, kind].filter(Boolean).join(" "),
      isin,
    });
  }

  results.sort((left, right) => {
    const byType = String(left.type).localeCompare(right.type);
    if (byType !== 0) return byType;
    const byExchange = String(left.exchange).localeCompare(right.exchange);
    if (byExchange !== 0) return byExchange;
    return String(left.ticker).localeCompare(right.ticker);
  });
  return results;
}

const OFFER = "https://bossa.pl/export/kid-abroad";

const OFFER_MARKETS = new Map([
  ["DB - Frankfurt (Xetra)", "XETR"],
  ["LSE - Londyn", "LSE"],
  ["Euronext Amsterdam", "EURONEXT"],
  ["Euronext Paryż", "EURONEXT"],
  ["SIX Swiss Exchange", "SIX"],
  ["GPW", "GPW"],
]);

function offerType(name) {
  const text = name.toUpperCase();
  if (/\bETN\b/.test(text)) return "ETN";
  if (/\bETC\b/.test(text)) return "ETC";
  if (/\bETP\b/.test(text) && !/\bETF\b/.test(text)) return "ETP";
  return "ETF";
}

async function offerListings(existing) {
  const response = await fetch(OFFER);
  if (!response.ok) throw new Error(`Bossa ETP table answered ${response.status}`);
  const payload = await response.json();
  const seen = new Set(existing.map((row) => `${row.isin}:${row.exchange}:${row.currency}`));
  const rows = [];
  for (const item of payload.items ?? []) {
    const isin = toIsin(item.isin);
    const exchange = OFFER_MARKETS.get(normalize(item.market));
    const currency = normalize(item.currency).toUpperCase();
    const ticker = normalize(item.symbol).toUpperCase();
    const name = normalize(item.name);
    if (!isin || !exchange || !CURRENCIES.has(currency) || !ticker) continue;
    const key = `${isin}:${exchange}:${currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const type = offerType(name);
    rows.push({
      query: isin,
      ticker,
      name: name || ticker,
      exchange,
      currency,
      type,
      raw: [ticker, name, normalize(item.market), currency, type].filter(Boolean).join(" "),
      isin,
    });
  }
  return rows;
}

const SHARE_BOARD = "https://www.bankier.pl/gielda/notowania/akcje";
const ETF_BOARD = "https://www.bankier.pl/etf/notowania";

function profileSymbols(html) {
  return [...new Set(html.match(/data-symbol="([^"]+)"/g) ?? [])].map((hit) =>
    hit.slice('data-symbol="'.length, -1)
  );
}

function etfNames(html) {
  const names = new Map();
  const pattern = /quote\.html\?symbol=([^"&]+)"[\s\S]{0,300}?m-tooltip__content">([^<]+)/g;
  for (const match of html.matchAll(pattern)) names.set(match[1], normalize(match[2]));
  return names;
}

async function profileHead(symbol) {
  const response = await fetch(
    `https://www.bankier.pl/inwestowanie/profile/quote.html?symbol=${encodeURIComponent(symbol)}`,
    { headers: { "user-agent": "Mozilla/5.0" } }
  );
  if (!response.ok) throw new Error(`${symbol} profile answered ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < 280_000) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel();
  return Buffer.concat(chunks).toString("utf8");
}

function profileRow(html, fallbackName, type) {
  const isin = toIsin(html.match(/data-isin="([^"]+)"/)?.[1]);
  const unit = html.match(/data-unit="([^"]+)"/)?.[1] ?? "";
  if (!isin || unit !== "zł") return null;
  const suffix = normalize(html.match(/a-heading__suffix[^"]*">([^<]+)/)?.[1]);
  const wrapped = suffix.match(/^(.*)\(([^)]+)\)\s*$/);
  const ticker = normalize(wrapped ? wrapped[2] : suffix).toUpperCase();
  const name = normalize(wrapped ? wrapped[1] : fallbackName);
  if (!ticker) return null;
  return {
    query: isin,
    ticker,
    name: name || ticker,
    exchange: "GPW",
    currency: "PLN",
    type,
    raw: [ticker, name, "GPW", "PLN", type].filter(Boolean).join(" "),
    isin,
  };
}

async function warsawListings() {
  const [sharesPage, etfPage] = await Promise.all([fetch(SHARE_BOARD), fetch(ETF_BOARD)]);
  if (!sharesPage.ok) throw new Error(`GPW share board answered ${sharesPage.status}`);
  if (!etfPage.ok) throw new Error(`GPW ETF board answered ${etfPage.status}`);
  const [sharesHtml, etfHtml] = await Promise.all([sharesPage.text(), etfPage.text()]);
  const jobs = [
    ...profileSymbols(sharesHtml).map((symbol) => ({ symbol, type: "STOCK", name: "" })),
    ...[...etfNames(etfHtml)].map(([symbol, name]) => ({ symbol, type: "ETF", name })),
  ];
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      const html = await profileHead(job.symbol);
      const row = profileRow(html, job.name, job.type);
      if (row) rows.push(row);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  return rows;
}

const bytes = await pdfBytes();
const fromPdf = listingsFrom(pdfRows(bytes));
const seen = new Set(fromPdf.map((row) => `${row.isin}:${row.exchange}:${row.currency}`));
const results = [...fromPdf];
for (const row of [...(await offerListings(fromPdf)), ...(await warsawListings())]) {
  const key = `${row.isin}:${row.exchange}:${row.currency}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push(row);
}
results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});
const outputPath = new URL("bossa-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(stampRows(results, import.meta.url), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})`
);
