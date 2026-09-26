// Zerodha publishes the whole offer as two public files, with no login.
//
// https://api.kite.trade/instruments
//   Every exchange contract: NSE, BSE, their derivatives, currency, MCX
//   and the commodity segment. A row is a symbol and a venue. There is
//   no ISIN. EQ is what the file says for a share and for an ETF.
//   The ISIN is joined from the NSE equity list and from the public
//   Upstox book, which prints the exchange ISIN beside the same symbol.
//   A cash row whose symbol is absent is still joined when its name
//   matches exactly one ISIN on that venue. Options, futures and
//   bonds are not part of this catalogue. A gilt ETF stays.
//   Only the NSE and BSE cash segments are kept. The INDICES segment
//   and the iNAV symbols are quotes, not orders.
//
// https://api.kite.trade/mf/instruments
//   Coin mutual funds. The symbol is the ISIN. A scheme is kept only
//   when purchase_allowed is 1.
//
// Strikes the exchange has withdrawn are absent. The GLOBAL rows are
// indices, not a foreign share book.
//
//   node zerodha/zerodha_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";

const INSTRUMENTS = "https://api.kite.trade/instruments";
const FUNDS = "https://api.kite.trade/mf/instruments";
const NSE_EQUITY = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const UPSTOX = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";

// These venues settle in rupees. GLOBAL is an index tape and carries
// no currency in the file.
const INR = new Set(["NSE", "BSE", "NFO", "BFO", "CDS", "MCX", "NCO", "NSEIX"]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) => {
    const record = {};
    header.forEach((name, index) => {
      record[name] = cells[index] ?? "";
    });
    return record;
  });
}

async function csv(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return parseCsv(await response.text());
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function remember(bySymbol, byName, exchange, symbol, name, isin) {
  const id = isinOf(isin);
  if (!id || !exchange) return;
  const ticker = String(symbol || "").trim().toUpperCase();
  const symbolKey = `${exchange}|${ticker}`;
  if (ticker && !bySymbol.has(symbolKey)) bySymbol.set(symbolKey, id);
  const label = String(name || "").trim().toUpperCase();
  if (!label) return;
  const key = `${exchange}|${label}`;
  const prior = byName.get(key);
  if (prior == null) byName.set(key, id);
  else if (prior !== id) byName.set(key, "");
}

async function isinMaps() {
  const bySymbol = new Map();
  const byName = new Map();
  const nse = await fetch(NSE_EQUITY, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!nse.ok) throw new Error(`NSE equity list answered ${nse.status}`);
  for (const row of parseCsv(await nse.text())) {
    remember(bySymbol, byName, "NSE", row.SYMBOL, row["NAME OF COMPANY"], row["ISIN NUMBER"]);
  }
  const book = await fetch(UPSTOX);
  if (!book.ok) throw new Error(`Upstox instrument file answered ${book.status}`);
  const rows = JSON.parse(gunzipSync(Buffer.from(await book.arrayBuffer())).toString("utf8"));
  for (const row of rows) {
    if (row.exchange !== "NSE" && row.exchange !== "BSE") continue;
    remember(bySymbol, byName, row.exchange, row.trading_symbol, row.name, row.isin);
  }
  return { bySymbol, byName };
}

function listingIsin(row, maps) {
  const exchange = row.exchange.trim();
  const symbol = maps.bySymbol.get(`${exchange}|${row.tradingsymbol.trim().toUpperCase()}`);
  if (symbol) return symbol;
  if (row.instrument_type.trim() !== "EQ") return "";
  return maps.byName.get(`${exchange}|${row.name.trim().toUpperCase()}`) || "";
}

const DERIVATIVES = new Set(["CE", "PE", "FUT"]);
// NSE prints the debt series on the symbol: state loans, government bonds,
// treasury bills, gold bonds, and the corporate N-series. An Indian ISIN
// whose security type is not 01 is a debenture; IN followed by a digit is
// a government issue. ETFs stay, including gilt ETFs.
const DEBT_SERIES = new Set([
  "SG", "GS", "TB", "GB",
  "N0", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9",
  "NA", "NB", "NC", "ND", "NE", "NF", "NG", "NH", "NI", "NJ",
  "NK", "NL", "NM", "NN", "NO", "NP", "NS",
]);

function isBond(row, isin) {
  const series = row.tradingsymbol.toUpperCase().match(/-([A-Z0-9]+)$/);
  if (series && DEBT_SERIES.has(series[1])) return true;
  const id = isin.toUpperCase();
  if (/^IN\d/.test(id)) return true;
  if (/^INE.{4}(07|08|09)/.test(id)) return true;
  const name = row.name.toUpperCase();
  if (/\bETF\b/.test(name)) return false;
  if (/^SDL /.test(name) || /^GOI (LOAN|TBILL)/.test(name) || /^\d+(\.\d+)?% (CENTRAL )?(GOI|CENTRAL GOVT)/.test(name)) return true;
  // NSE also codes a debenture as the coupon plus a two-letter series
  // (1003SCL30-BW, IIFL060326-YA). The name is the code itself. A share
  // whose symbol starts with a digit, such as 3IINFOLTD-BE, keeps its
  // company name and stays.
  const ticker = row.tradingsymbol.toUpperCase();
  const label = name || ticker;
  const coded = ticker.match(/-([A-Z0-9]+)$/);
  if (coded && /^(SM|ST|SO|BE|BZ|IV|RR|EQ|BL)$/.test(coded[1])) return false;
  // S1–SZ, apart from the SME series, are fully convertible debentures.
  if (coded && /^S[0-9A-Z]$/.test(coded[1])) return true;
  if (!coded || label !== ticker) return false;
  return /^\d/.test(ticker) || /^(IIFL|SCL)/.test(ticker);
}

// A cash order exists on the NSE or BSE segment. Indices live in their own
// segment, and an iNAV symbol only publishes the indicative value of an ETF.
function isSold(row) {
  const segment = row.segment.trim().toUpperCase();
  if (segment !== "NSE" && segment !== "BSE") return false;
  const ticker = row.tradingsymbol.toUpperCase();
  return !/INAV|-NAV$/.test(ticker);
}

const maps = await isinMaps();
const listings = (await csv(INSTRUMENTS))
  .filter((row) => !DERIVATIVES.has(row.instrument_type.trim()))
  .filter((row) => isSold(row))
  .filter((row) => !isBond(row, listingIsin(row, maps)))
  .map((row) => {
  const ticker = row.tradingsymbol.trim();
  const exchange = row.exchange.trim();
  const name = row.name.trim();
  const type = row.instrument_type.trim();
  return {
    query: ticker,
    ticker,
    name: name || ticker,
    exchange,
    currency: INR.has(exchange) ? "INR" : "",
    type,
    raw: [ticker, name, exchange, type].filter(Boolean).join(" "),
    isin: listingIsin(row, maps),
  };
});

const seen = new Set(listings.map((row) => `${row.exchange}:${row.ticker}`));
for (const row of await csv(FUNDS)) {
  if (row.purchase_allowed.trim() !== "1") continue;
  const isin = isinOf(row.tradingsymbol);
  const ticker = isin || row.tradingsymbol.trim();
  const key = `COIN:${ticker}`;
  if (!ticker || seen.has(key)) continue;
  seen.add(key);
  const name = row.name.trim();
  listings.push({
    query: ticker,
    ticker,
    name: name || ticker,
    exchange: "COIN",
    currency: "INR",
    type: "FUND",
    raw: [ticker, name, row.amc, row.scheme_type, row.plan].filter(Boolean).join(" "),
    isin,
  });
}

listings.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});

const outputPath = new URL("zerodha-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(stampRows(listings), null, 2));

const byType = new Map();
for (const row of listings) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const withIsin = listings.filter((row) => row.isin).length;
console.error(
  `${listings.length} listings over ${new Set(listings.map((row) => row.isin || `${row.exchange}:${row.ticker}`)).size} instruments ` +
    `(${withIsin} with an ISIN; ${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
