// What Sahi sells in shares and exchange-traded products, with no
// login. A small public file names the instrument file of the day.
// Derivatives are in that file and are not here. A second file is
// commodities, and it is not here either.
//
// The type and the series are on the row. A line marked not tradable,
// or sell-only, stays out. On the NSE, EQ, BE, BZ, SM, ST and SZ are
// shares. An ETF is the ETF type, unless the name says ETC or ETN.
// InvITs, REITs, the partly-paid series and a rights entitlement stay
// out. On the BSE, the share groups are the order. The file prints no
// ISIN. One is filled from the exchange list when the symbol matches.
// An indicative NAV stays out.
//
// The coin is not sold. Neither file has a coin shelf.
//
//   https://assets.sahi.com/instruments/metadata2.json
//
//   node brokers/sahi/sahi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { cashBook, isInav, lookup, parseCsv } from "../../indianCash.mjs";

const META = "https://assets.sahi.com/instruments/metadata2.json";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const NSE = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);
const BSE = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "MS"]);

async function get(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function listingType(name) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const meta = await (await get(META, "application/json")).json();
const file = String(meta.url || "");
if (!file) throw new Error(`${META} names no instrument file`);
const csv = gunzipSync(Buffer.from(await (await get(file, "application/gzip")).arrayBuffer())).toString("utf8");
const source = parseCsv(csv);
const book = await cashBook();
console.error(`${source.length} rows in ${file}`);

const rows = [];
const seen = new Set();
for (const cell of source) {
  const exchange = String(cell.exchange || "").trim().toUpperCase();
  const kind = String(cell.instrument_type || "").trim().toUpperCase();
  const series = String(cell.series || "").trim().toUpperCase();
  const ticker = String(cell.symbol || "").trim().toUpperCase();
  const name = String(cell.company_name || "").replace(/\s+/g, " ").trim();
  if (exchange !== "NSE" && exchange !== "BSE") {
    skip(exchange || "not cash");
    continue;
  }
  if (cell.tradable !== "1" || cell.sqr_off_only === "1") {
    skip(cell.sqr_off_only === "1" ? "sell only" : "not tradable");
    continue;
  }
  if (!ticker || isInav(ticker)) {
    skip("not a share");
    continue;
  }
  const etf = kind === "ETF";
  const share = kind === "STK" && (exchange === "NSE" ? NSE.has(series) : BSE.has(series));
  if (!etf && !share) {
    skip(kind === "STK" ? series || "not a share" : kind || "not a share");
    continue;
  }
  if (/-RE\d*$/.test(ticker)) {
    skip("rights");
    continue;
  }
  const found = lookup(book, exchange, ticker);
  const isin = found?.isin || "";
  const type = etf || isin.startsWith("INF") ? listingType(name) : "EQ";
  const key = `${exchange}|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: ticker,
    ticker,
    name: name || found?.name || ticker,
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

fs.writeFileSync(new URL("sahi-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${rows.length} listings (${rows.filter((row) => row.isin).length} with an ISIN) ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
