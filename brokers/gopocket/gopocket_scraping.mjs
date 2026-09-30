// What GoPocket sells as a share or an ETF. The contract master is
// public and needs no token. Futures, options, currency, commodities and
// the index file stay out. Direct mutual funds are another shelf.
//
// https://web.gopocket.in/contract/csv/nse
// https://web.gopocket.in/contract/csv/bse
//   NSE writes the series in Group Name. EQ, BE, BZ, SM, ST and SZ are
//   shares. Instrument Type ETF is an ETF when the series is a share series
//   or the joined ISIN starts with INF. Group IV is an InvIT. Group SF is
//   a fund-plan code and stays out when the cash book has no INF code. A
//   share mistyped as ETF in another group stays out. There is no ISIN.
//   BSE type E mixes shares and ETFs and has no group, so the series and
//   the ISIN are joined from the NSE list and from Upstox. A line with no
//   join stays out. An indicative NAV stays out. Rights, InvIT and REIT
//   stay out.
//
//   node brokers/gopocket/gopocket_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { parseCsv, cashBook, lookup, companyName, isinOf, debtIsin, isInav } from "../../indianCash.mjs";
import fs from "node:fs";

const ROOT = "https://web.gopocket.in/contract/csv/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const NSE = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);
const BSE = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "MS", "EQ", "BE", "BZ", "SM", "ST", "SZ"]);

async function textOf(name) {
  const url = `${ROOT}${name}`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/csv" },
        signal: controller.signal,
      });
      const text = response.ok ? await response.text() : "";
      if (response.ok && text.startsWith("Exch,")) return text;
      last = response.ok ? `not a contract ${url}` : `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

function groupFtf(symbol) {
  return /ETF|BEES|LIQUID/i.test(symbol) && !/INAV/i.test(symbol);
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

function listedName(ticker, printed, entry) {
  const named = companyName(ticker, ticker, entry);
  const printedName = String(printed || "").replace(/\s+/g, " ").trim();
  return named === ticker && printedName ? printedName : named;
}

const book = await cashBook();
const rows = [];
const seen = new Set();

for (const cell of parseCsv(await textOf("nse"))) {
  const ticker = String(cell.Symbol || "").trim().toUpperCase();
  if (!ticker) {
    skip("not a share");
    continue;
  }
  if (isInav(ticker)) {
    skip("indicative nav");
    continue;
  }
  const series = String(cell["Group Name"] || "").trim().toUpperCase();
  const tagged = String(cell["Instrument Type"] || "").trim().toUpperCase();
  const entry = lookup(book, "NSE", ticker);
  const isin = isinOf(entry?.isin);
  if (isin && debtIsin(isin)) {
    skip("not a share");
    continue;
  }
  const share = NSE.has(series) && tagged !== "ETF";
  const etf = tagged === "ETF" && series !== "IV" && series !== "RR" && (NSE.has(series) || isin.startsWith("INF"));
  if (!share && !etf) {
    skip("not a share");
    continue;
  }
  const key = `NSE|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: isin || ticker,
    ticker,
    name: listedName(ticker, cell["Instrument Name"], entry),
    exchange: "NSE",
    currency: "INR",
    type: etf ? "ETF" : "EQ",
    raw: [ticker, "NSE", "INR", series, isin].filter(Boolean).join(" "),
    isin,
  });
}

for (const cell of parseCsv(await textOf("bse"))) {
  const ticker = String(cell.Symbol || "").trim().toUpperCase();
  if (!ticker) {
    skip("not a share");
    continue;
  }
  const tagged = String(cell["Instrument Type"] || "").trim().toUpperCase();
  if (tagged !== "E") {
    skip("not a share");
    continue;
  }
  if (isInav(ticker) || isInav(cell["Instrument Name"])) {
    skip("indicative nav");
    continue;
  }
  const entry = lookup(book, "BSE", ticker);
  const series = String(entry?.series || "").trim().toUpperCase();
  const isin = isinOf(entry?.isin);
  if (!isin) {
    skip("not a share");
    continue;
  }
  if (debtIsin(isin)) {
    skip("not a share");
    continue;
  }
  const etf = isin.startsWith("INF") || series === "E" || series === "ETF" || (series === "F" && groupFtf(ticker));
  const share = BSE.has(series) && !etf;
  if (!share && !etf) {
    skip("not a share");
    continue;
  }
  const key = `BSE|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: isin,
    ticker,
    name: listedName(ticker, cell["Instrument Name"], entry),
    exchange: "BSE",
    currency: "INR",
    type: etf ? "ETF" : "EQ",
    raw: [ticker, "BSE", "INR", series, isin].filter(Boolean).join(" "),
    isin,
  });
}

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("gopocket-parsed.json", import.meta.url), JSON.stringify(stampRows(rows), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const withIsin = rows.filter((row) => row.isin).length;
const instruments = new Set(rows.map((row) => row.isin || `${row.type}:${row.ticker}:${row.exchange}`)).size;
console.error(
  `${rows.length} listings over ${instruments} instruments (${withIsin} with an ISIN) ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
