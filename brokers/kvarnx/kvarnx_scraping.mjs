// Kvarn X (Kvarn Investment Services, Finland) passes stock and ETF orders
// to Interactive Brokers. What it sells is the instrument list behind its
// public Invest page: one JSON, no login, every stock and every ETF the
// page offers, with the venue suffix, the currency and the symbol.
//
// The help centre names the markets: US, Germany, France, the UK, the
// Netherlands, Sweden, Norway and Denmark, selected Italian, Spanish and
// Swiss names, and European ETFs and ETPs. Finnish shares are not sold.
// On 18 Oct 2026 the list held 393 shares (the help centre says "more than
// 400") and no Swiss line.
//
// The suffix is the data vendor's code: US (the row names Nasdaq, NYSE,
// AMEX or PINK), XETRA, F (Frankfurt), DU (Düsseldorf), MU (Munich), PA,
// AS, MI, MC, LSE, ST, CO and OL. No ISIN is printed. The code is joined
// to ../../assets/stocks.csv and etfs.csv on the same place; one ISIN is
// kept, several are left on the row as matches. A fund line whose name
// says ETC or ETN, or the one "ETP" line (Xetra-Gold), is stored as such.
// Crypto, gold and the coming funds and derivatives are not part of it.
//
//   https://www.kvarnx.com/en/invest
//   https://www.kvarnx.com/api/instruments/market
//   https://help.kvarnx.com/en/articles/13760738-selection-and-investment-themes
//
//   node brokers/kvarnx/kvarnx_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SOURCE = "https://www.kvarnx.com/api/instruments/market";
const ASSETS = [new URL("../../assets/stocks.csv", import.meta.url), new URL("../../assets/etfs.csv", import.meta.url)];

// Vendor suffix (or, for US, the row's exchange) -> [exchange, MIC, places in the asset files].
const PLACE = {
  NASDAQ: ["Nasdaq", "XNAS", ["NASDAQ"]],
  NYSE: ["NYSE", "XNYS", ["NYSE"]],
  AMEX: ["NYSE American", "XASE", ["AMEX"]],
  PINK: ["OTC Markets", "OTCM", ["OTC"]],
  XETRA: ["Xetra", "XETR", ["XETR"]],
  F: ["Börse Frankfurt", "XFRA", ["FWB"]],
  DU: ["Börse Düsseldorf", "XQTX", ["DUS"]],
  MU: ["Börse München", "XMUC", ["MUN"]],
  PA: ["Euronext Paris", "XPAR", ["EURONEXT"]],
  AS: ["Euronext Amsterdam", "XAMS", ["EURONEXT", "XAMS"]],
  MI: ["Euronext Milan", "XMIL", ["MIL"]],
  MC: ["Bolsa de Madrid", "XMAD", ["BME"]],
  LSE: ["London Stock Exchange", "XLON", ["LSE"]],
  ST: ["Nasdaq Stockholm", "XSTO", ["OMXSTO"]],
  CO: ["Nasdaq Copenhagen", "XCSE", ["OMXCOP"]],
  OL: ["Oslo Børs", "XOSL", ["OSL"]],
};
const FLOOR = { STOCK: 350, ETF: 400 };

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function codeKey(value) {
  return normalize(value).toUpperCase().replace(/[\s._/-]+/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// place -> code -> ISINs
function isinIndex() {
  const index = new Map();
  for (const file of ASSETS) {
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    if (table[0]?.slice(0, 3).join(",") !== "ticker,exchange,isin") throw new Error(`${file.pathname} header changed`);
    for (const line of table.slice(1)) {
      const place = normalize(line[1]).toUpperCase();
      const code = codeKey(normalize(line[0]).split(":").pop());
      const isin = normalize(line[2]).toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(place)) index.set(place, new Map());
      const book = index.get(place);
      if (!book.has(code)) book.set(code, new Set());
      book.get(code).add(isin);
    }
  }
  return index;
}

function typeOf(item) {
  if (item.security_type === "Equity") return "STOCK";
  const name = item.displayName || "";
  if (/\bUCITS\b|\bETF\b/i.test(name)) return "ETF";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b|etc\b/i.test(name) || /ETPs/.test(item.security_type)) return "ETC";
  return "ETF";
}

const response = await fetch(SOURCE, { headers: { "User-Agent": UA, Accept: "application/json" } });
if (!response.ok) throw new Error(`${SOURCE} answered ${response.status}`);
const data = await response.json();
if (!Array.isArray(data.stocks) || !Array.isArray(data.etfs)) throw new Error("instrument list has no stocks or etfs array");

const index = isinIndex();
const rows = [];
const unknown = [];
const tally = { one: 0, several: 0, none: 0 };
for (const item of [...data.stocks, ...data.etfs]) {
  const symbol = normalize(item.symbol);
  const dot = symbol.lastIndexOf(".");
  const suffix = symbol.slice(dot + 1).toUpperCase();
  const code = symbol.slice(0, dot);
  const venue = suffix === "US" ? normalize(item.general?.Exchange).toUpperCase() : suffix;
  const place = PLACE[venue];
  if (!place || !code) { unknown.push(`${symbol} ${item.general?.Exchange}`); continue; }
  const [exchange, mic, files] = place;
  // Nordic share classes read "VOLV B" on the exchange; the vendor writes VOLV-B.
  const ticker = ["ST", "CO", "OL"].includes(suffix) ? code.replace(/-/g, " ") : code;
  const type = typeOf(item);
  const currency = normalize(item.currency).toUpperCase();
  const name = normalize(item.displayName) || ticker;
  const row = { query: ticker, ticker, name, exchange, mic, currency, type, isin: "", raw: [symbol, name, item.general?.Exchange || suffix, currency, item.security_type].filter(Boolean).join(" ") };

  const groups = new Map();
  for (const file of files) {
    const ids = index.get(file)?.get(codeKey(code));
    if (ids?.size) groups.set(file, ids);
  }
  const found = new Set([...groups.values()].flatMap((ids) => [...ids]));
  if (found.size === 1) { row.isin = [...found][0]; tally.one += 1; }
  else if (found.size > 1) { stampIsinMatches(row, groups, code); tally.several += 1; }
  else tally.none += 1;
  rows.push(row);
}
if (unknown.length) throw new Error(`unmapped venue: ${unknown.join(", ")}`);

const unique = new Map();
for (const row of rows) unique.set(`${row.mic}|${row.ticker}|${row.currency}`, row);
const sorted = [...unique.values()].sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));

const byType = {};
const counts = {};
for (const row of sorted) {
  const kind = row.type === "STOCK" ? "STOCK" : "ETF";
  byType[kind] = (byType[kind] || 0) + 1;
  counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
}
for (const [kind, floor] of Object.entries(FLOOR)) {
  if ((byType[kind] || 0) < floor) throw new Error(`${kind}: ${byType[kind] || 0} rows, expected at least ${floor}`);
}

fs.writeFileSync(new URL("kvarnx-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(sorted)), null, 2));
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`${sorted.length} rows. ISIN ${tally.one}, several ${tally.several}, none ${tally.none}.`);
