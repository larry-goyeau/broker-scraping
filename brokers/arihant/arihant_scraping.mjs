// What Arihant sells as a share or an ETF. The contract master is public:
// the docs print an API key, and a GET without one still returns the file.
// Futures, options, currency and commodities stay out. Direct mutual funds
// are another shelf. MCX is refused by this call.
//
// https://tradebridge.arihantplus.com/wrapper-service/api/symbol/v1/master?exch=NSE
//   The live JSON has no ISIN and no company name. NSE series EQ, BE, BZ,
//   SM, ST and SZ are shares, and so are the BSE groups A, B, T, XT, X, Z,
//   ZP, M, MT, P, TS and MS. Instrument ETF is an ETF, including BSE group F.
//   The rest of group F is commercial paper. Indices are instrument IDX.
//   Series MF, SF, IV, RR and BSE group IF stay out. The ISIN is joined from
//   the NSE list and from Upstox. A line with no join stays out. An
//   indicative NAV stays out. Rights stay out.
//
//   node brokers/arihant/arihant_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { cashBook, lookup, companyName, isinOf, debtIsin, isInav } from "../../indianCash.mjs";
import fs from "node:fs";

const ROOT = "https://tradebridge.arihantplus.com/wrapper-service/api/symbol/v1/master?exch=";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const NSE = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);
const BSE = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "MS"]);

async function masterOf(exch) {
  const url = `${ROOT}${exch}`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.ok) {
        const body = await response.json();
        const symbols = body?.data?.symbols;
        if (Array.isArray(symbols)) return symbols;
        last = `${body?.infoID || "empty"} ${body?.infoMsg || url}`;
      } else last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const book = await cashBook();
const rows = [];
const seen = new Set();

for (const exch of ["NSE", "BSE"]) {
  for (const cell of await masterOf(exch)) {
    const exchange = String(cell.exc || exch).trim().toUpperCase();
    if (exchange !== "NSE" && exchange !== "BSE") {
      skip("contract");
      continue;
    }
    const ticker = String(cell.dispSym || "").trim().toUpperCase();
    if (!ticker) {
      skip("not a share");
      continue;
    }
    if (isInav(ticker)) {
      skip("indicative nav");
      continue;
    }
    const series = String(cell.series || "").trim().toUpperCase();
    const instrument = String(cell.instrument || "").trim().toUpperCase();
    const etf = instrument === "ETF";
    const share = instrument === "STK" && ((exchange === "NSE" && NSE.has(series)) || (exchange === "BSE" && BSE.has(series)));
    if (!share && !etf) {
      skip(instrument === "IDX" ? "index" : "not a share");
      continue;
    }
    const entry = lookup(book, exchange, ticker);
    const isin = isinOf(entry?.isin);
    if (!isin || debtIsin(isin)) {
      skip("not a share");
      continue;
    }
    if (etf && !isin.startsWith("INF")) {
      skip("not a share");
      continue;
    }
    if (!etf && !isin.startsWith("INE") && !isin.startsWith("IN9")) {
      skip("not a share");
      continue;
    }
    const key = `${exchange}|${ticker}`;
    if (seen.has(key)) throw new Error(`repeated ${key}`);
    seen.add(key);
    rows.push({
      query: isin,
      ticker,
      name: companyName(ticker, ticker, entry),
      exchange,
      currency: "INR",
      type: etf ? "ETF" : "EQ",
      raw: [ticker, exchange, "INR", series, isin].filter(Boolean).join(" "),
      isin,
    });
  }
}

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("arihant-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instruments = new Set(rows.map((row) => row.isin)).size;
console.error(
  `${rows.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
