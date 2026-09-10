import puppeteer from "puppeteer-core";
import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").replace(/[\s/]+/g, ".").trim();
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback ? new URL(fallback, import.meta.url) : "";
}

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

function loadByIsin(csvPath, kind, index = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (!isin) continue;
    const name = normalize(columns.slice(3).join(","));
    const exchange = normalize(columns[1]).toUpperCase();
    const entry = index.get(isin);
    if (!entry) {
      index.set(isin, {
        isin,
        kind,
        names: name ? [name] : [],
        exchange,
        exchanges: new Set(exchange ? [exchange] : []),
      });
    } else {
      if (exchange) entry.exchanges.add(exchange);
      if (name && !entry.names.includes(name)) entry.names.push(name);
    }
  }
  return index;
}

const US_VENUES = ["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"];

const SUFFIX_VENUE = {
  US: "NYSE",
  DE: "XETR",
  UK: "LSE",
  PL: "WSE",
  ES: "BME",
  FR: "EURONEXT",
  DK: "OMX",
  ETF: "XETR",
};

function listingType(suffix, name) {
  if (suffix === "ETF") {
    if (/\bETNs?\b/i.test(name)) return "ETN";
    const withoutParens = name.replace(/\([^)]*\)/g, " ");
    if (/\bETCs?\b/i.test(withoutParens) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) {
      return "ETC";
    }
    return "ETF";
  }
  return "STOCK";
}

function venueOf(suffix, match) {
  if (suffix === "US" && match?.exchanges) {
    for (const code of US_VENUES) {
      if (code === "CBOE") continue;
      if (match.exchanges.has(code)) return code;
    }
  }
  if (suffix === "ETF" && match?.exchanges) {
    for (const code of ["XETR", "LSE", "EURONEXT", "MIL", "SIX", "AMEX", "NASDAQ", "NYSE"]) {
      if (match.exchanges.has(code)) return code;
    }
    if (match.exchange) return match.exchange;
  }
  if (match?.exchange && suffix === "US") return match.exchange;
  return SUFFIX_VENUE[suffix] || match?.exchange || "";
}

function currencyOf(code) {
  const text = normalize(code).toUpperCase();
  if (text === "GBX" || text === "GBP") return "GBP";
  return /^[A-Z]{3}$/.test(text) ? text : "";
}

function parseBook(text) {
  const rows = [];
  const pattern =
    /^([A-Z0-9][A-Z0-9.]{0,15})\.(US|DE|UK|PL|ES|FR|DK|ETF)\n(.+?)\n([A-Z]{2}[A-Z0-9]{10})\n(?:[\d.,]+\n)?([A-Z]{3})\n/gm;
  for (const match of text.matchAll(pattern)) {
    const ticker = match[1];
    const suffix = match[2];
    if (/_CFD$/i.test(ticker)) continue;
    rows.push({
      ticker,
      suffix,
      name: normalize(match[3]),
      isin: match[4],
      currency: currencyOf(match[5]),
    });
  }
  return rows;
}

function extractPdfText(bytes) {
  const pdfPath = path.join(os.tmpdir(), "oanda-stocks.pdf");
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
  if (result.status !== 0) {
    throw new Error(result.stderr || "python3 could not read OANDA's stocks PDF (pypdf).");
  }
  return result.stdout;
}

async function bytesFromPage(page, url) {
  const b64 = await page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: "include" });
    if (!response.ok) return { status: response.status };
    const buffer = new Uint8Array(await response.arrayBuffer());
    const chunks = [];
    const step = 0x8000;
    for (let i = 0; i < buffer.length; i += step) {
      chunks.push(String.fromCharCode(...buffer.subarray(i, i + step)));
    }
    return { status: response.status, b64: btoa(chunks.join("")) };
  }, url);
  if (!b64?.b64) throw new Error(`OANDA did not return ${url} (${b64?.status || "no body"}).`);
  return Buffer.from(b64.b64, "base64");
}

async function discoverListUrl(page) {
  const html = await page.evaluate(async () => {
    const response = await fetch("/eu-en/documents", { credentials: "include" });
    return response.text();
  });
  const matches = [...html.matchAll(/href="([^"]+document\/\d+)"[^>]*>\s*List of Financial Instruments\s*</gi)];
  const current = matches.find((match) => !/\(\d{2}\.\d{2}\.\d{2}/.test(match[0]));
  const href = current?.[1] || matches[0]?.[1] || "/eu-en/document/80";
  return href.startsWith("http") ? href : new URL(href, "https://www.oanda.com").href;
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over. `--start=` is accepted so
// a resumed run can reload oanda-parsed.json; the book arrives in one PDF.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const catalogue = new Map();
if (wantEtfs) loadByIsin(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadByIsin(stocksCsvPath, "STOCK", catalogue);

const onlyIsins = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(toIsin)
    .filter(Boolean)
);
const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
    .map((ticker) => ticker.replace(/\.(US|DE|UK|PL|ES|FR|DK|ETF)$/i, ""))
);

const outputPath = new URL("oanda-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) {
          seen.add(`${entry.isin || entry.ticker}:${entry.exchange || ""}:${entry.ticker}:${entry.currency || ""}:${entry.type || ""}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore malformed prior output.
  }
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("oanda.com")) || (await browser.newPage());

if (!page.url().includes("oanda.com")) {
  await page.goto("https://www.oanda.com/eu-en/platform", { waitUntil: "domcontentloaded" });
  await sleep(2000);
}

// Cash shares and UCITS ETFs live on the TMS Stocks list. CFDs (including
// BTCUSD) are a different book and are left out. Crypto is CFD-only here.
const listUrl = await discoverListUrl(page);
console.error(`Reading ${listUrl}`);
const book = parseBook(extractPdfText(await bytesFromPage(page, listUrl)));
console.error(`${book.length} lines on the Stocks list`);

let unlisted = 0;
const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (const item of book) {
  const type = listingType(item.suffix, item.name);
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;
  if (type === "CRYPTO" && !wantCrypto) continue;

  const ticker = normalizeTicker(item.ticker);
  const isin = item.isin;
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  if (onlyTickers.size > 0 || onlyIsins.size > 0) {
    if (!onlyTickers.has(ticker) && !onlyIsins.has(isin)) continue;
  }

  const match = isin ? catalogue.get(isin) : null;
  if (!match && !keepUnlisted) {
    unlisted += 1;
    continue;
  }

  const exchange = venueOf(item.suffix, match);
  const currency = item.currency;
  if (!exchange) {
    skip("no exchange");
    continue;
  }
  if (!currency) {
    skip("no currency");
    continue;
  }

  const key = `${isin || ticker}:${exchange}:${ticker}:${currency}:${type}`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  const name = normalize(item.name || match?.names?.[0] || ticker);
  results.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, isin].filter(Boolean).join(" "),
    isin: isin || "",
  });
}

if (wantCrypto && !results.some((row) => row.type === "CRYPTO")) {
  console.error("No spot crypto: BTC/ETH on this entity are CFDs.");
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

fs.writeFileSync(outputPath, JSON.stringify(stampRows(results, import.meta.url), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const byCurrency = new Map();
for (const row of results) byCurrency.set(row.currency, (byCurrency.get(row.currency) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"}; ` +
    `${[...byCurrency].map(([currency, count]) => `${count} ${currency}`).join(", ") || "no currency"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);

await browser.disconnect();
