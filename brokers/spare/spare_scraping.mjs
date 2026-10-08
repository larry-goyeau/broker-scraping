// SpareBank sells shares on Oslo Børs through the SB1 Markets trading
// service. It publishes no names, and the trading page does not mention
// ETFs. The rows are every share and every ETF Euronext files on Oslo
// Børs. Equity certificates sit in the share file: the download has no
// type column, so they stay with the shares. Warrants and rights are
// not in either file. Euronext Growth and Euronext Expand are other
// markets and stay out.
//
//   https://www.sparebank1.no/nb/bank/privat/sparing/investering/aksjehandel.html
//   https://live.euronext.com/en/markets/oslo/equities/euronext/list
//   https://live.euronext.com/en/markets/oslo/etfs/list
//   https://live.euronext.com/product_directory/data/stocks-oslo-euronext-regulated-/download?mics=XOSL
//   https://live.euronext.com/product_directory/data/etfs-oslo/download?mics=XOAM,XOAS,XOBD,XOSL
//
//   node brokers/spare/spare_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SHARES = "https://live.euronext.com/product_directory/data/stocks-oslo-euronext-regulated-/download?mics=XOSL";
const ETFS = "https://live.euronext.com/product_directory/data/etfs-oslo/download?mics=XOAM,XOAS,XOBD,XOSL";

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ";") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function download(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/csv" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return parseCsv(await response.text());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function column(header, name) {
  const index = header.findIndex((cell) => normalize(cell).toLowerCase() === name);
  if (index < 0) throw new Error(`Oslo file has no ${name} column`);
  return index;
}

function listings(table, type) {
  const header = table.find((row) => row.some((cell) => normalize(cell) === "ISIN"));
  if (!header) throw new Error(`Oslo ${type} file has no header`);
  const isinAt = column(header, "isin");
  const fullNameAt = header.findIndex((cell) => normalize(cell).toLowerCase() === "instrument fullname");
  const nameAt = fullNameAt >= 0 ? fullNameAt : column(header, "name");
  const symbolAt = column(header, "symbol");
  const marketAt = column(header, "market");
  const currencyAt = column(header, "currency");
  const found = new Map();
  for (const row of table) {
    const isin = isinOf(row[isinAt]);
    if (!isin) continue;
    const ticker = normalize(row[symbolAt]).toUpperCase();
    const name = normalize(row[nameAt]);
    const market = normalize(row[marketAt]);
    const currency = normalize(row[currencyAt]).toUpperCase();
    if (!ticker || !name) throw new Error(`${isin} has no ticker or name`);
    if (market !== "Oslo Børs") throw new Error(`${ticker} is listed on ${market || "nowhere"}`);
    if (currency !== "NOK") throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
    const prior = found.get(isin);
    if (prior && prior.ticker !== ticker) {
      throw new Error(`${isin} is both ${prior.ticker} and ${ticker}`);
    }
    if (!prior) found.set(isin, { ticker, name, isin, type });
  }
  return found;
}

const shares = listings(await download(SHARES), "STOCK");
const funds = listings(await download(ETFS), "ETF");
for (const [isin, fund] of funds) {
  fund.type = "ETF";
  if (shares.has(isin)) throw new Error(`${fund.ticker} is both a share and an ETF`);
}

const rows = [...shares.values(), ...funds.values()].map((row) => ({
  query: row.ticker,
  ticker: row.ticker,
  name: row.name,
  exchange: "XOSL",
  currency: "NOK",
  type: row.type,
  isin: row.isin,
  raw: [row.ticker, row.name, "XOSL", "NOK", row.isin, row.type].join(" "),
}));

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

if (shares.size < 150) throw new Error(`only ${shares.size} Oslo Børs shares`);
if (funds.size < 1) throw new Error(`only ${funds.size} Oslo Børs ETFs`);
for (const ticker of ["EQNR", "DNB", "OBXD"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("spare-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byBook = new Map();
for (const row of kept) byBook.set(row.type, (byBook.get(row.type) || 0) + 1);
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} XOSL ${label}`).join(", ")})`
);
