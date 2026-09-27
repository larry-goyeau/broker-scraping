// What finanzen.net ZERO sells in stocks, listed products and coins, with no
// login. The search file is the shop. Column five is the kind: A is a share,
// E is a listed product (ETF, ETC, ETN, ETP), K is a coin. Funds and
// derivatives sit in the same file and stay out. A bond is not a listed
// product here, ETF or not. A coin stays.
//
// Every kept share and listed product trades on gettex. A coin does not: ZERO
// passes the order to Baader Bank, off exchange. The file does not print the
// place or the currency. gettex says the trading currency is the euro, and
// every coin is quoted in euro.
//
// The symbol is the short code in the alias. An ETF has none, so the WKN is
// the symbol. When that column is blank, a German ISIN still holds the WKN.
// A code that Excel rewrote (3E2 becoming 3.00E+02) is read from the token
// that still has a digit.
//
//   https://mein.finanzen-zero.net/assets/searchdata/instruments.csv
//   https://www.gettex.de/ueber-gettex/faqs/
//   https://www.finanzen.net/zero/krypto/
//   https://www.finanzen.net/zero/
//
//   node finanzen/finanzen_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import zlib from "node:zlib";

const CSV = "https://mein.finanzen-zero.net/assets/searchdata/instruments.csv";
const EXCHANGE = "XMUN";
const CURRENCY = "EUR";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

const BOND = /\b(bonds?|gilts?|treasur(?:y|ies)|bunds?|obligations?|ibonds?|govt|government|pfandbriefe?|iboxx|eurogov|covered|corporates?|anleihe|sovereign|money market|rendite plus)\b/i;

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function wknOf(isin, wkn) {
  const printed = String(wkn || "").trim().toUpperCase();
  if (printed) return printed;
  // A German ISIN with a blank WKN still carries it: DE000 + six characters + check.
  if (String(isin).startsWith("DE") && String(isin).length === 12) return String(isin).slice(5, 11);
  return "";
}

function cryptoTicker(alias) {
  const base = String(alias || "").split(",")[1] || "";
  const text = base.trim().toUpperCase();
  return /^[A-Z0-9]{1,10}$/.test(text) ? text : "";
}

function tickerOf(alias, wkn) {
  const tokens = String(alias || "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
  const candidates = tokens.filter((token) => /^[A-Z0-9]{2,6}$/.test(token));
  const withDigit = candidates.find((token) => /\d/.test(token));
  return withDigit || candidates[0] || wkn;
}

function listingType(kind, name) {
  if (kind === "A") return "STOCK";
  if (kind === "K") return "CRYPTO";
  if (kind !== "E" || BOND.test(name)) return "";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETPs?\b/i.test(name)) return "ETP";
  return "ETF";
}

async function loadCsv() {
  const response = await fetch(CSV, {
    headers: { "User-Agent": UA, Accept: "text/csv" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`finanzen.net ZERO answered ${response.status}`);
  const buf = Buffer.from(await response.arrayBuffer());
  const zipped = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  return (zipped ? zlib.gunzipSync(buf) : buf).toString("utf8");
}

const text = await loadCsv();
const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const seen = new Set();
const results = [];
for (const line of text.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [isinRaw, wkn, nameRaw, alias, kind] = line.split(";");
  const kindCode = String(kind || "").trim().toUpperCase();
  if (kindCode !== "A" && kindCode !== "E" && kindCode !== "K") {
    skip("not a stock or ETF");
    continue;
  }
  const name = String(nameRaw || "").replace(/\s+/g, " ").trim();
  const type = listingType(kindCode, name);
  if (!type) {
    skip("bond");
    continue;
  }
  const isin = toIsin(isinRaw);
  if (!isin) {
    skip("no ISIN");
    continue;
  }
  const coin = type === "CRYPTO";
  const exchange = coin ? "CRYPTO" : EXCHANGE;
  const currency = coin ? "EUR" : CURRENCY;
  const ticker = coin ? cryptoTicker(alias) : tickerOf(alias, wknOf(isin, wkn));
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  const id = `${isin}:${exchange}:${ticker}:${currency}:${type}`;
  if (seen.has(id)) continue;
  seen.add(id);
  results.push({
    query: coin ? ticker : isin,
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, isin].filter(Boolean).join(" "),
    isin,
  });
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(
  new URL("finanzen-parsed.json", import.meta.url),
  JSON.stringify(stampRows(results), null, 2)
);

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
