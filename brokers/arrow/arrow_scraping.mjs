// What Arrow sells in shares and exchange-traded products, with no
// login. One public file. Derivatives, currency, commodities and the
// index segment are in it and are not here.
//
// The series is on the row. On the NSE, EQ, BE, BZ, SM, ST and SZ are
// shares. An INF code in one of those series is an ETF unless the name
// says ETC or ETN. Debt series, indices, InvITs, REITs and the MF and
// SF fund-plan codes stay out. A name containing NSETEST is a dummy
// and stays out. On the BSE, the share groups are the order. A line
// whose series starts with MF: is an ETF. An indicative NAV stays out.
//
// The coin is not sold. The file has no coin shelf.
//
//   https://edge.arrow.trade/all
//   https://docs.arrow.trade/symbols/
//
//   node brokers/arrow/arrow_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";
import { debtIsin, isinOf, isInav, parseCsv } from "../../indianCash.mjs";

const FILE = "https://edge.arrow.trade/all";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const NSE = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);
const BSE = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "MS"]);

async function table() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(FILE, {
        headers: { "User-Agent": UA, Accept: "text/csv" },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return parseCsv(await response.text());
      last = `${response.status} ${FILE}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function listingType(name, isin) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (isin.startsWith("INF") || /\bETFs?\b/i.test(name)) return "ETF";
  return "EQ";
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const rows = [];
const seen = new Set();
const source = await table();
console.error(`${source.length} rows in ${FILE}`);

for (const cell of source) {
  const exchange = String(cell.Exchange || "").trim().toUpperCase();
  const segment = String(cell.Segment || "").trim().toUpperCase();
  const series = String(cell.Series || "").trim().toUpperCase();
  const ticker = String(cell.Symbol || "").trim().toUpperCase();
  const name = String(cell.FullName || "").replace(/\s+/g, " ").trim();
  const isin = isinOf(cell.ISIN);
  if (segment !== "CM" || (exchange !== "NSE" && exchange !== "BSE")) {
    skip(segment || exchange || "not cash");
    continue;
  }
  if (!ticker || /NSETEST/i.test(ticker) || /NSETEST/i.test(name) || isInav(ticker) || isInav(name)) {
    skip("not a share");
    continue;
  }
  if (!isin || debtIsin(isin)) {
    skip(isin ? "debt" : "no isin");
    continue;
  }
  const group = series.includes(":") ? series.split(":")[1] : series;
  const listed = series.startsWith("MF:") || (exchange === "NSE" && NSE.has(series) && isin.startsWith("INF"));
  const share = exchange === "NSE" ? NSE.has(series) : BSE.has(group) && series.startsWith("EQ:");
  if (exchange === "NSE" && !NSE.has(series)) {
    skip(series || "not a share");
    continue;
  }
  if (!listed && !share) {
    skip(series || "not a share");
    continue;
  }
  const type = listed || isin.startsWith("INF") ? listingType(name, isin) : "EQ";
  const key = `${exchange}|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: isin,
    ticker,
    name: name || ticker,
    exchange,
    currency: "INR",
    type,
    isin,
    raw: [ticker, name, exchange, "INR", series, isin].filter(Boolean).join(" "),
  });
}

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("arrow-parsed.json", import.meta.url), JSON.stringify(stampRows(rows), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${rows.length} listings (${rows.filter((row) => row.isin).length} with an ISIN) ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
