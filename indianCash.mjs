// NSE and BSE series that are an order. EQ is the rolling share, and also
// the ETF. BE, BZ and ST are trade-for-trade. SM is the SME book. IV and
// RR are an InvIT and a REIT. The BSE letter is the group, and E is an ETF.
// Indices, iNAV symbols and debt series are not in these sets.
import fs from "node:fs";
import { gunzipSync } from "node:zlib";

const NSE_SOLD = new Set(["EQ", "BE", "BZ", "SM", "ST", "IV", "RR"]);
const BSE_SOLD = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "R", "E", "MS"]);

const NSE_EQUITY = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const UPSTOX = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";

export function parseGrid(text) {
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
  return rows;
}

export function parseCsv(text) {
  const [header, ...body] = parseGrid(text);
  return body.map((cells) => {
    const record = {};
    header.forEach((name, index) => {
      record[String(name || "").trim()] = cells[index] ?? "";
    });
    return record;
  });
}

export function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

export function debtIsin(isin) {
  const id = isinOf(isin);
  if (!id) return false;
  if (/^IN\d/.test(id)) return true;
  return /^INE.{4}(07|08|09)/.test(id);
}

export function isInav(symbol) {
  return /INAV|-NAV$/i.test(String(symbol || ""));
}

// A quote with no ISIN. An ETF keeps its INF code, so this does not see it.
function isIndexQuote(symbol) {
  const text = String(symbol || "").toUpperCase();
  if (/NSETEST\b/.test(text)) return true;
  if (/NIFTY|SENSEX|BANKEX|DEFTY|INDIA VIX|HANG\s*SENG/.test(text)) return true;
  if (/^BSE\b/.test(text) || /^S&P\b/.test(text) || /^MIDCAP\b/.test(text)) return true;
  return /\bINDEX\b/.test(text);
}

export function seriesOf(symbol) {
  const match = String(symbol || "").toUpperCase().match(/-([A-Z0-9]+)$/);
  return match ? match[1] : "";
}

export function rootOf(symbol) {
  const text = String(symbol || "").trim().toUpperCase();
  const series = seriesOf(text);
  return series ? text.slice(0, -(series.length + 1)) : text;
}

export function soldSeries(exchange, series) {
  const code = String(series || "").trim().toUpperCase();
  const venue = String(exchange || "").trim().toUpperCase();
  if (venue !== "NSE" && venue !== "BSE" && venue !== "N" && venue !== "B") return false;
  // 5paisa writes EQ on BSE as well as NSE. A broker may use either code.
  return NSE_SOLD.has(code) || BSE_SOLD.has(code);
}

// A row is kept when it is a sold series, or an exchange ETF, and it is
// not an indicative NAV and not a debenture ISIN.
export function keepSold(exchange, series, symbol, isin, etf = false) {
  if (isInav(symbol)) return false;
  if (debtIsin(isin)) return false;
  if (!isinOf(isin) && isIndexQuote(symbol)) return false;
  if (etf) return true;
  return soldSeries(exchange, series);
}

function remember(book, exchange, symbol, isin, name, series) {
  const id = isinOf(isin);
  const ticker = rootOf(symbol);
  if (!exchange || !ticker) return;
  const key = `${exchange}|${ticker}`;
  const prior = book.get(key);
  const incoming = {
    isin: id,
    name: String(name || "").trim(),
    series: String(series || "").trim().toUpperCase(),
  };
  if (!prior) {
    book.set(key, incoming);
    return;
  }
  book.set(key, {
    isin: prior.isin || incoming.isin,
    name: prior.name || incoming.name,
    series: incoming.series || prior.series,
  });
}

// NSE equity list, then the Upstox cash book. The series comes from Upstox.
export async function cashBook() {
  const book = new Map();
  const nse = await fetch(NSE_EQUITY, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!nse.ok) throw new Error(`NSE equity list answered ${nse.status}`);
  for (const row of parseCsv(await nse.text())) {
    remember(book, "NSE", row.SYMBOL, row["ISIN NUMBER"], row["NAME OF COMPANY"], "EQ");
  }
  const response = await fetch(UPSTOX);
  if (!response.ok) throw new Error(`Upstox instrument file answered ${response.status}`);
  const rows = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"));
  for (const row of rows) {
    if (row.segment !== "NSE_EQ" && row.segment !== "BSE_EQ") continue;
    remember(book, row.exchange, row.trading_symbol, row.isin, row.name, row.instrument_type);
  }
  return book;
}

export function lookup(book, exchange, symbol) {
  return book.get(`${exchange}|${rootOf(symbol)}`) || null;
}

export function companyName(printed, symbol, entry) {
  const name = String(printed || "").replace(/\s+/g, " ").trim();
  const root = rootOf(symbol);
  if (name && name.toUpperCase() !== root && name.toUpperCase() !== String(symbol || "").toUpperCase()) return name;
  return entry?.name || name || root;
}
