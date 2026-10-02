// What Air Bank sells online, with no login.
//
// Shares are the PDF "Seznam akcií, do kterých můžete investovat". The file
// does not mark a name that has stopped trading, so those lines stay. A few
// UCITS ETFs are filed in that PDF too.
//
// The ETF page is the ETF offer. Each row links a Czech KID, which carries
// the ISIN. The line trades on Xetra, in euro: the tariff's ETF minimum is
// 5 EUR. The Xetra ticker comes from the ETF list when the ISIN is there.
//
// The fund page names eight Czech mutual funds. The bond page currently
// lists none. The Air Bank certificate is a separate product and is not here.
//
//   https://www.airbank.cz/file-download/seznam-akcii-web
//   https://www.airbank.cz/seznam-etf/
//   https://www.airbank.cz/produkty/investice/seznam-fondu/
//
//   node brokers/airbank/airbank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STOCKS = "https://www.airbank.cz/file-download/seznam-akcii-web";
const ETFS = "https://www.airbank.cz/seznam-etf/";
const FUNDS = "https://www.airbank.cz/produkty/investice/seznam-fondu/";
const ORIGIN = "https://www.airbank.cz";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

const CSV_TO_MIC = {
  NASDAQ: "XNAS",
  NYSE: "XNYS",
  AMEX: "ARCX",
  CBOE: "BATS",
};
const US_LISTED = new Set(Object.keys(CSV_TO_MIC));

// The last character of an ISIN is a check digit. A bare word such as
// ACCUMULATING is twelve letters and must not win.
const ISIN = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;

function toIsin(value) {
  const match = String(value || "").toUpperCase().match(ISIN);
  return match ? match[1] : "";
}

function listTicker(value) {
  return String(value || "").trim().toUpperCase().split(":").pop();
}

async function getBytes(url, accept) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

function pdfText(bytes) {
  const pdfPath = path.join(os.tmpdir(), `airbank-${process.pid}.pdf`);
  fs.writeFileSync(pdfPath, bytes);
  const script = [
    "from pypdf import PdfReader",
    "import sys",
    "reader = PdfReader(sys.argv[1])",
    "sys.stdout.write('\\n'.join((page.extract_text() or '') for page in reader.pages))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script, pdfPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  fs.rmSync(pdfPath, { force: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || "python3 could not read an Air Bank PDF (pypdf).");
  }
  return result.stdout;
}

function stockRows(text) {
  const pending = [];
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || line.startsWith("Air Bank") || line.startsWith("Společnost") || /^\d+\/\d+$/.test(line)) continue;
    if (line.startsWith("Seznam") || line.startsWith("Akcie ISIN")) continue;
    const match = line.match(ISIN);
    if (!match) {
      pending.push(line);
      continue;
    }
    const name = [...pending, line.slice(0, match.index)].join(" ").replace(/\s+/g, " ").trim();
    const ticker = line.slice(match.index + match[1].length).trim().toUpperCase();
    pending.length = 0;
    if (!name || !ticker || /\s/.test(ticker)) continue;
    rows.push({ name, isin: match[1], ticker });
  }
  return rows;
}

function isEtfName(name) {
  return /\bETF\b|\bUCITS\b/i.test(name);
}

function loadUs(csvPath, into) {
  if (!fs.existsSync(csvPath)) return into;
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = listTicker(columns[0]);
    const exchange = String(columns[1] || "").trim().toUpperCase();
    const isin = toIsin(columns[2]);
    if (!ticker || !isin || !US_LISTED.has(exchange)) continue;
    const bucket = into.get(ticker) || [];
    const existing = bucket.find((row) => row.isin === isin);
    if (existing) existing.mics.add(CSV_TO_MIC[exchange]);
    else bucket.push({ isin, mics: new Set([CSV_TO_MIC[exchange]]) });
    into.set(ticker, bucket);
  }
  return into;
}

function loadXetra(csvPath) {
  const byIsin = new Map();
  if (!fs.existsSync(csvPath)) return byIsin;
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    if (String(columns[1] || "").trim().toUpperCase() !== "XETR") continue;
    const isin = toIsin(columns[2]);
    const ticker = listTicker(columns[0]);
    if (isin && ticker && !byIsin.has(isin)) byIsin.set(isin, ticker);
  }
  return byIsin;
}

function usPlace(index, ticker, isin) {
  const rows = (index.get(ticker) || []).filter((row) => row.isin === isin);
  const pool = rows.length ? rows : index.get(ticker) || [];
  const mics = new Set();
  for (const row of pool) for (const mic of row.mics) mics.add(mic);
  return mics.size === 1 ? [...mics][0] : "US";
}

function etfLinks(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const hrefs = [...match[0].matchAll(/href="([^"]*file-download[^"]*)"/gi)].map((hit) => hit[1]);
    if (!hrefs.length) continue;
    const text = match[0]
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .replace(/\s*Klíčové informace.*$/i, "")
      .trim();
    const name = text || "Amundi MSCI World V";
    rows.push({ name, kid: new URL(hrefs[0], ORIGIN).href });
  }
  return rows;
}

function fundRows(html) {
  const rows = [];
  const seen = new Set();
  for (const match of html.matchAll(/"name":"([^"]+)","url":"\/produkty\/investice\/(CZ[A-Z0-9]{10})\//g)) {
    if (seen.has(match[2])) continue;
    seen.add(match[2]);
    rows.push({ name: match[1], isin: match[2] });
  }
  return rows;
}

const us = loadUs(new URL("../../assets/stocks.csv", import.meta.url), new Map());
loadUs(new URL("../../assets/etfs.csv", import.meta.url), us);
const xetra = loadXetra(new URL("../../assets/etfs.csv", import.meta.url));

const shareText = pdfText(await getBytes(STOCKS, "application/pdf"));
const shares = stockRows(shareText);
const byIsin = new Map();

for (const row of shares) {
  const etf = isEtfName(row.name);
  byIsin.set(row.isin, {
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: etf ? "XETR" : usPlace(us, row.ticker, row.isin),
    currency: etf ? "EUR" : "USD",
    type: etf ? "ETF" : "STOCK",
    isin: row.isin,
  });
}

const etfPage = (await getBytes(ETFS, "text/html")).toString("utf8");
let kidIsin = 0;
for (const row of etfLinks(etfPage)) {
  const text = pdfText(await getBytes(row.kid, "application/pdf"));
  const isin = toIsin(text);
  if (!isin) continue;
  kidIsin += 1;
  const prior = byIsin.get(isin);
  const ticker = prior?.ticker || xetra.get(isin) || "";
  byIsin.set(isin, {
    query: ticker || isin,
    ticker,
    name: prior?.name || row.name,
    exchange: "XETR",
    currency: "EUR",
    type: "ETF",
    isin,
  });
}

const fundPage = (await getBytes(FUNDS, "text/html")).toString("utf8");
for (const row of fundRows(fundPage)) {
  if (byIsin.has(row.isin)) continue;
  byIsin.set(row.isin, {
    query: row.isin,
    ticker: "",
    name: row.name,
    exchange: "",
    currency: "CZK",
    type: "FUND",
    isin: row.isin,
  });
}

const results = [...byIsin.values()]
  .map((row) => ({
    ...row,
    raw: [row.ticker, row.name, row.exchange, row.currency, row.isin].filter(Boolean).join(" "),
  }))
  .sort((left, right) => {
    const byType = left.type.localeCompare(right.type);
    if (byType !== 0) return byType;
    return (left.ticker || left.isin).localeCompare(right.ticker || right.isin, "en");
  });

fs.writeFileSync(new URL("airbank-parsed.json", import.meta.url), JSON.stringify(stampRows(results), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const unplaced = results.filter((row) => row.exchange === "US").length;
console.error(
  `${results.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    `, KID ISIN on ${kidIsin} ETF page rows` +
    (unplaced ? `, ${unplaced} US without a place` : "")
);
