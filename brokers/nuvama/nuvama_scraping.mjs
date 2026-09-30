// What Nuvama sells as a share or an ETF. The public contract file is the
// list the trading API can route. Futures, options, currency, commodities
// and indices stay out. A mutual fund scheme is a second file, not this one.
//
// https://np.nuvamawealth.com/app/toccontracts/instruments.zip
//   Cash rows are asset type EQUITY. The ticker is symbolname. The ISIN is
//   the column of the same name. NSE series EQ, BE, BZ, SM, ST and SZ are
//   shares, and so are the BSE groups A, B, T, XT, X, Z, ZP, M, MT, P, TS,
//   R, E and MS. An ETF is an INF line, including the ones filed in BSE
//   group F. The rest of group F is commercial paper and debentures.
//   InvIT and REIT series stay out.
//
//   node nuvama/nuvama_scraping.mjs

import { stampRows } from "../accepted.mjs";
import { parseCsv, isinOf } from "../indianCash.mjs";
import { inflateRawSync } from "node:zlib";
import fs from "node:fs";

const FILE = "https://np.nuvamawealth.com/app/toccontracts/instruments.zip";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const NSE = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);
const BSE = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "R", "E", "MS"]);

async function zipOf() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(FILE, {
        headers: { "User-Agent": UA, Accept: "application/zip" },
        signal: controller.signal,
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${FILE}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

function csvOf(zip) {
  if (zip.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip");
  const method = zip.readUInt16LE(8);
  const nameLen = zip.readUInt16LE(26);
  const extraLen = zip.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  let size = zip.readUInt32LE(18);
  if (size === 0) {
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (end < 0) throw new Error("zip size is missing");
    size = zip.readUInt32LE(end + 20);
  }
  const data = zip.subarray(start, start + size);
  if (method === 0) return data.toString("utf8");
  if (method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`unread zip method ${method}`);
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const rows = [];
const seen = new Set();
for (const cell of parseCsv(csvOf(await zipOf()))) {
  const kind = String(cell.assettype || "").trim().toUpperCase();
  if (kind !== "EQUITY") {
    skip(kind === "INDEX" ? "index" : "contract");
    continue;
  }
  const exchange = String(cell.exchange || "").trim().toUpperCase();
  if (exchange !== "NSE" && exchange !== "BSE") throw new Error(`unread exchange ${exchange} ${cell.symbolname}`);
  const series = String(cell.series || "").trim().toUpperCase();
  const isin = isinOf(cell.isin);
  const etf = isin.startsWith("INF");
  const share = (exchange === "NSE" && NSE.has(series)) || (exchange === "BSE" && BSE.has(series));
  if (!etf && !share) {
    skip("not a share");
    continue;
  }
  if (!etf && !isin.startsWith("INE") && !isin.startsWith("IN9")) {
    skip("not a share");
    continue;
  }
  const ticker = String(cell.symbolname || "").trim().toUpperCase();
  if (!ticker) throw new Error("unread ticker");
  if (!isin) throw new Error(`unread isin ${ticker}`);
  const key = `${exchange}|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  const name = String(cell.description || cell.symbolname || "").replace(/\s+/g, " ").trim() || ticker;
  rows.push({
    query: isin,
    ticker,
    name,
    exchange,
    currency: "INR",
    type: etf ? "ETF" : "EQ",
    raw: [ticker, name, exchange, "INR", series, isin].filter(Boolean).join(" "),
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

fs.writeFileSync(new URL("nuvama-parsed.json", import.meta.url), JSON.stringify(stampRows(rows), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instruments = new Set(rows.map((row) => row.isin)).size;
console.error(
  `${rows.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
