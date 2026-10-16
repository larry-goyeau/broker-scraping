// What DragonFi sells in shares and the listed ETF, with no login.
// The market page reads this list. One call returns the whole file, and
// the file names its own total. A delisted name, a test row, a warrant,
// a follow-on and an unlisted preferred stay out. The quote is pesos.
// A line whose name says dollars is USD.
//
//   https://www.dragonfi.ph/market/stocks/PSE
//   https://api.dragonfi.ph/api/v2/Securities/GetFilteredSecuritiesList
//
//   node brokers/dragonfi/dragonfi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const LIST = "https://api.dragonfi.ph/api/v2/Securities/GetFilteredSecuritiesList";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PAGE = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = clean(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

async function getJson(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${url} answered ${response.status}`);
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt === 3) break;
      await sleep(400 * (attempt + 1));
    }
  }
  throw last;
}

async function securities() {
  const found = [];
  let total = null;
  for (let page = 1; page < 20; page += 1) {
    const url = `${LIST}?pageNum=${page}&pageSize=${PAGE}&sortBy=StockCode&asc=true`;
    const body = await getJson(url);
    const rows = body?.stockProfileList;
    if (!Array.isArray(rows)) throw new Error("DragonFi published no securities list");
    if (!Number.isInteger(body.totalCount) || body.totalCount < 1) {
      throw new Error("DragonFi published no total");
    }
    if (total == null) total = body.totalCount;
    if (body.totalCount !== total) throw new Error("DragonFi changed the total mid-read");
    found.push(...rows);
    if (found.length >= total) break;
    if (!rows.length) break;
  }
  if (found.length !== total) throw new Error(`DragonFi listed ${found.length} names, the file says ${total}`);
  return found;
}

function currencyOf(name) {
  if (/\bUSD\b/i.test(name) || /dollar/i.test(name)) return "USD";
  return "PHP";
}

function kindOf(row, name) {
  if (row.sectorCode === "ETF" || row.industryCode === "ETFE" || /exchange traded fund|\bETF\b/i.test(name)) {
    return "ETF";
  }
  return "STOCK";
}

function leaveOut(row, ticker, name) {
  if (row.isDelisted) return "delisted";
  if (/^PRODTEST/i.test(ticker) || /prod test/i.test(name)) return "test";
  if (/\bwarrants?\b/i.test(name)) return "warrant";
  if (/-FOO$/i.test(ticker)) return "follow-on";
  if (/\bunlisted\b/i.test(name)) return "unlisted";
  return "";
}

const book = await securities();
const leftOut = [];
const listed = [];
const seen = new Set();

for (const row of book) {
  const ticker = clean(row.stockCode).toUpperCase();
  const name = clean(row.companyName);
  if (!ticker || !name) {
    leftOut.push(`${ticker || "a line"} has no name`);
    continue;
  }
  if (seen.has(ticker)) throw new Error(`${ticker} is listed twice`);
  seen.add(ticker);
  const why = leaveOut(row, ticker, name);
  if (why) {
    leftOut.push(`${ticker} ${why}`);
    continue;
  }
  const type = kindOf(row, name);
  const currency = currencyOf(name);
  const isin = isinOf(row.isin);
  listed.push({
    query: ticker,
    ticker,
    name,
    exchange: "PSE",
    currency,
    type,
    isin,
    raw: [ticker, name, "PSE", currency, isin, type].filter(Boolean).join(" "),
  });
}

listed.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

for (const ticker of ["SM", "ALI", "BDO", "AETF", "FMETF"]) {
  if (!listed.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}
for (const ticker of ["PRODTEST1", "2GO", "AGIW"]) {
  if (listed.some((row) => row.ticker === ticker)) throw new Error(`${ticker} was kept`);
}
const shares = listed.filter((row) => row.type === "STOCK").length;
const etfs = listed.filter((row) => row.type === "ETF").length;
if (shares < 250) throw new Error(`only ${shares} shares`);
if (etfs < 1) throw new Error(`only ${etfs} ETFs`);
if (!listed.some((row) => row.ticker === "AETF" && row.type === "ETF")) throw new Error("AETF is not an ETF");
if (!listed.some((row) => row.ticker === "DTEL" && row.currency === "USD")) throw new Error("DTEL is not in dollars");

const kept = stampRows(withoutObligations(listed));
fs.writeFileSync(new URL("dragonfi-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin).filter(Boolean)).size} instruments ` +
    `(${shares} STOCK, ${etfs} ETF)`
);
if (leftOut.length) console.error(`${leftOut.length} lines left out: ${leftOut.sort().join(", ")}`);
if (kept.length < listed.length) console.error(`${listed.length - kept.length} bonds left out`);
