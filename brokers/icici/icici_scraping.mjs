// ICICI Direct publishes the cash book in one public zip, with no login.
//
// https://directlink.icicidirect.com/NewSecurityMaster/SecurityMaster.zip
//   NSEScripMaster.txt and BSEScripMaster.txt. The ISIN is on the row.
//   ExchangeCode is the ticker. On the NSE the Series column is the
//   series. On the BSE that column is DR or C, not the group, so the
//   group is taken from the NSE list or the Upstox cash book and kept
//   on the line. The BSE transaction charge depends on it.
//   Futures, options and currency are the other files in the zip and
//   are not here. Debt, a preference and an iNAV stay out.
//
//   https://api.icicidirect.com/breezeapi/documents/index.html
//   https://www.icicidirect.com/faqs/fno/where-to-get-stock-codes-tokens-and-other-relevant-information-for-f-o-contracts
//
//   node brokers/icici/icici_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { parseCsv, isinOf, keepSold, cashBook, lookup, companyName, soldSeries } from "../../indianCash.mjs";

const ZIP = "https://directlink.icicidirect.com/NewSecurityMaster/SecurityMaster.zip";
const FILES = {
  "NSEScripMaster.txt": "NSE",
  "BSEScripMaster.txt": "BSE",
};

function unzip(buffer) {
  const files = new Map();
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const compressed = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    const data = bytes.subarray(start, start + compressed);
    const text = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
    if (!text) throw new Error(`${name} uses zip method ${method}`);
    files.set(name, text.toString("utf8"));
    offset = start + compressed;
  }
  return files;
}

const response = await fetch(ZIP);
if (!response.ok) throw new Error(`${ZIP} answered ${response.status}`);
const files = unzip(Buffer.from(await response.arrayBuffer()));
const book = await cashBook();
const listings = [];
const seen = new Set();

for (const [name, exchange] of Object.entries(FILES)) {
  const text = files.get(name);
  if (!text) throw new Error(`${ZIP} has no ${name}`);
  for (const row of parseCsv(text)) {
    const ticker = String(row.ExchangeCode || "").trim();
    if (!ticker) continue;
    const entry = lookup(book, exchange, ticker);
    const isin = isinOf(row.ISINCode) || entry?.isin || "";
    if (!isin) continue;
    const fileSeries = String(row.Series || "").trim().toUpperCase();
    const series = soldSeries(exchange, fileSeries) ? fileSeries : entry?.series || "";
    if (!keepSold(exchange, series, ticker, isin, isin.startsWith("INF"))) continue;
    const key = `${exchange}|${ticker.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const printed = companyName(row.CompanyName, ticker, entry);
    listings.push({
      query: ticker,
      ticker,
      name: printed,
      exchange,
      currency: "INR",
      type: "EQ",
      raw: [ticker, printed, exchange, isin].filter(Boolean).join(" "),
      isin,
      ...(exchange === "BSE" && series ? { group: series } : {}),
    });
  }
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("icici-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
