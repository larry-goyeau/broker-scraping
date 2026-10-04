// What Definedge sells in shares and exchange-traded products, with no
// login. Two public cash files. Derivatives, currency and commodities
// are other files and are not here.
//
// The instrument type is the series. On the NSE, EQ, BE, BZ, SM, ST and
// SZ are shares. An INF code in one of those series is an ETF unless the
// name says ETC or ETN. Debt series, indices, InvITs, REITs and the SF
// fund-plan codes stay out. On the BSE, the share groups are the order.
// An INF code, including one sitting in group F beside the bonds, is an
// ETF. An indicative NAV stays out.
//
// The coin is not sold. The master has no coin shelf.
//
//   https://app.definedgesecurities.com/public/nsecash.zip
//   https://app.definedgesecurities.com/public/bsecash.zip
//   https://www.definedgesecurities.com/api-documentation/
//
//   node brokers/definedge/definedge_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { debtIsin, isinOf, isInav } from "../../indianCash.mjs";

const FILES = [
  "https://app.definedgesecurities.com/public/nsecash.zip",
  "https://app.definedgesecurities.com/public/bsecash.zip",
];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const NSE = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);
const BSE = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "MS"]);

function zipText(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Definedge archive is not a zip");
  const central = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(central) !== 0x02014b50) throw new Error("Definedge archive has no file");
  const method = buffer.readUInt16LE(central + 10);
  const compressed = buffer.readUInt32LE(central + 20);
  const local = buffer.readUInt32LE(central + 42);
  if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error("Definedge archive has no local file");
  const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
  const data = buffer.subarray(start, start + compressed);
  if (method === 0) return data.toString("utf8");
  if (method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`Definedge archive method ${method} is not readable`);
}

async function cashText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/zip" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return zipText(Buffer.from(await response.arrayBuffer()));
      last = `${response.status} ${url}`;
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

for (const url of FILES) {
  const text = await cashText(url);
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cell = line.split(",");
    if (cell.length < 15) {
      skip("short row");
      continue;
    }
    count += 1;
    const exchange = cell[0].trim().toUpperCase();
    const ticker = cell[2].trim().toUpperCase();
    const series = cell[4].trim().toUpperCase();
    const isin = isinOf(cell[12]);
    const name = cell[14].replace(/\s+/g, " ").trim();
    if (exchange !== "NSE" && exchange !== "BSE") {
      skip(exchange || "no venue");
      continue;
    }
    if (!ticker || isInav(ticker) || isInav(name) || series === "IDX") {
      skip("not a share");
      continue;
    }
    if (isin && debtIsin(isin)) {
      skip("debt");
      continue;
    }
    const listed = isin.startsWith("INF") || series === "E" || /\bETFs?\b/i.test(name);
    const share = exchange === "NSE" ? NSE.has(series) : BSE.has(series);
    if (!listed && !share) {
      skip(series || "not a share");
      continue;
    }
    if (listed && exchange === "NSE" && !NSE.has(series)) {
      skip(series || "not a share");
      continue;
    }
    const type = listed ? listingType(name, isin) : "EQ";
    const key = `${exchange}|${ticker}`;
    if (seen.has(key)) throw new Error(`repeated ${key}`);
    seen.add(key);
    rows.push({
      query: isin || ticker,
      ticker,
      name: name || ticker,
      exchange,
      currency: "INR",
      type,
      isin: isin || null,
      raw: [ticker, name, exchange, "INR", series, isin].filter(Boolean).join(" "),
    });
  }
  console.error(`${count} rows in ${url.split("/").pop()}`);
}

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("definedge-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const withIsin = rows.filter((row) => row.isin).length;
console.error(
  `${rows.length} listings (${withIsin} with an ISIN) ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
