// What VNDirect sells in shares and exchange-traded funds, with no login.
// The public stock file is the book. Each line names its board, a type
// and an ISIN, and says whether it is still listed. Shares are STOCK
// and funds are ETF. Covered warrants, bonds, derivatives and open-end
// funds are other products and are not written. A delisted line is not
// in this query.
//
//   https://api-finfo.vndirect.com.vn/v4/stocks?q=status:listed&size=5000
//
//   node brokers/vndirect/vndirect_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import dns from "node:dns";
import fs from "node:fs";

dns.setDefaultResultOrder("ipv4first");

const LIST = "https://api-finfo.vndirect.com.vn/v4/stocks?q=status:listed&size=";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const SOLD = { STOCK: "STOCK", ETF: "ETF" };
const LEFT_OUT = {
  COVERED_WARRANT: "covered warrants",
  BOND: "bonds",
  DERIVATIVE: "derivatives",
  IFC: "open-end funds",
};

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

// A smaller page repeats rows already returned. One response the size of
// the file does not.
const probe = await getJson(`${LIST}1`);
const expected = Number(probe.totalElements);
if (!(expected > 0)) throw new Error("the listed file has no size");
const body = await getJson(`${LIST}${expected}`);
const book = body?.data;
if (!Array.isArray(book) || book.length !== expected) {
  throw new Error(`listed file has ${Array.isArray(book) ? book.length : "no"} rows, not ${expected}`);
}

const rows = [];
const seen = new Set();
const leftOut = new Map();
for (const line of book) {
  const kind = String(line.type || "").trim().toUpperCase();
  const type = SOLD[kind];
  if (!type) {
    if (!LEFT_OUT[kind]) throw new Error(`unknown type ${kind} on ${line.code}`);
    leftOut.set(kind, (leftOut.get(kind) || 0) + 1);
    continue;
  }
  if (String(line.status || "").trim().toLowerCase() !== "listed") {
    throw new Error(`${line.code} is ${line.status || "unmarked"}`);
  }
  const ticker = String(line.code || "").trim().toUpperCase();
  const exchange = String(line.floor || "").trim().toUpperCase();
  const name = String(line.companyName || line.companyNameEng || "").replace(/\s+/g, " ").trim();
  const isin = String(line.isin || "").trim().toUpperCase();
  if (!ticker || !name) throw new Error(`unreadable listing ${JSON.stringify(line.code)}`);
  if (exchange !== "HOSE" && exchange !== "HNX" && exchange !== "UPCOM") {
    throw new Error(`${ticker} is on ${exchange || "no board"}`);
  }
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
  if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
  seen.add(ticker);
  seen.add(isin);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency: "VND",
    type,
    isin,
    raw: [ticker, name, exchange, isin, type].join(" "),
  });
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("vndirect-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const byType = new Map();
for (const row of rows) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const skipped = [...leftOut].map(([kind, count]) => `${count} ${LEFT_OUT[kind]}`).join(", ");
console.error(
  `${rows.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). Left out: ${skipped || "none"}.`
);
