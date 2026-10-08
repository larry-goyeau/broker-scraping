// What Pinetree sells in shares and exchange-traded funds, with no login.
// The public price board is the book. `listed=Y` is every name still
// listed. The file has no type. A name that says "Quỹ ETF" is an ETF.
// A name that says "Chứng quyền" is a covered warrant. A "Quỹ" that is
// not an ETF is a closed-end certificate. HCX is the bond board. Those
// three stay out. STO is HOSE, STX is HNX, UPX is UPCOM. A delisted
// line is not in this file. The file has no ISIN; the cash-market
// price query prints it.
//
//   https://trade.pinetree.vn/getlistallstock?listed=Y
//   https://api.dnse.com.vn/price-api/query
//
//   node brokers/pinetree/pinetree_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import dns from "node:dns";
import fs from "node:fs";

dns.setDefaultResultOrder("ipv4first");

const LIST = "https://trade.pinetree.vn/getlistallstock?listed=Y";
const PRICE = "https://api.dnse.com.vn/price-api/query";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const BOARD = { STO: "HOSE", STX: "HNX", UPX: "UPCOM" };
// Round-lot board. HOSE is market 6, HNX is 7, UPCOM is 8.
const QUOTE_BOARD = 2;
const MARKET = { HOSE: 6, HNX: 7, UPCOM: 8 };
const ISIN_QUERY = `query ($symbols: [String]!, $board: Int!) {
  GetKrxStockInfoBySymbols(symbols: $symbols, board: $board) {
    si { symbol isin marketId }
  }
}`;

async function getJson(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        body: options.body,
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(90_000),
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

function kindOf(line) {
  const board = String(line.post_to || "").trim().toUpperCase();
  const name = String(line.name_vn || "").replace(/\s+/g, " ").trim();
  const folded = name.toLowerCase();
  if (board === "HCX" || folded.includes("trái phiếu")) return "bond";
  if (folded.includes("chứng quyền")) return "warrant";
  if (/\betf\b/i.test(name)) return "etf";
  if (/^quỹ\s/i.test(name)) return "fund";
  if (BOARD[board]) return "stock";
  throw new Error(`unknown board ${board || "none"} on ${line.stock_code}`);
}

const book = await getJson(LIST);
if (!Array.isArray(book) || !book.length) throw new Error(`${LIST} has no listings`);

const rows = [];
const seen = new Set();
const leftOut = new Map();
for (const line of book) {
  const listed = String(line.delist_yn || "").trim().toUpperCase();
  if (listed !== "N") throw new Error(`${line.stock_code} is marked delisted on the listed file`);
  const kind = kindOf(line);
  const ticker = String(line.stock_code || "").trim().toUpperCase();
  const name = String(line.name_vn || "").replace(/\s+/g, " ").trim();
  if (!ticker || !name || name.toLowerCase() === "null") throw new Error(`unreadable listing ${JSON.stringify(line.stock_code)}`);
  if (kind !== "stock" && kind !== "etf") {
    const label = kind === "warrant" ? "covered warrants" : kind === "bond" ? "bonds" : "closed-end funds";
    leftOut.set(label, (leftOut.get(label) || 0) + 1);
    continue;
  }
  const exchange = BOARD[String(line.post_to || "").trim().toUpperCase()];
  if (!exchange) throw new Error(`${ticker} is on ${line.post_to || "no board"}`);
  if (seen.has(ticker)) throw new Error(`repeated ${ticker}`);
  seen.add(ticker);
  rows.push({ ticker, name, exchange, type: kind === "etf" ? "ETF" : "STOCK" });
}

const isin = new Map();
const marketOf = new Map();
let pending = rows.map((row) => row.ticker);
for (let round = 0; round < 4 && pending.length; round += 1) {
  const still = [];
  for (let start = 0; start < pending.length; start += 300) {
    const slice = pending.slice(start, start + 300);
    let quote;
    try {
      quote = await getJson(PRICE, {
        method: "POST",
        body: JSON.stringify({ query: ISIN_QUERY, variables: { symbols: slice, board: QUOTE_BOARD } }),
      });
    } catch {
      still.push(...slice);
      continue;
    }
    if (quote?.errors?.length) {
      still.push(...slice);
      continue;
    }
    const lines = quote?.data?.GetKrxStockInfoBySymbols?.si;
    if (!Array.isArray(lines)) {
      still.push(...slice);
      continue;
    }
    const got = new Set();
    for (const hit of lines) {
      const code = String(hit.symbol || "").trim().toUpperCase();
      const codeIsin = String(hit.isin || "").trim().toUpperCase();
      if (!code || !slice.includes(code)) continue;
      if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(codeIsin)) throw new Error(`no ISIN for ${code}`);
      isin.set(code, codeIsin);
      marketOf.set(code, Number(hit.marketId));
      got.add(code);
    }
    for (const code of slice) if (!got.has(code)) still.push(code);
  }
  pending = still;
  if (pending.length) await new Promise((resolve) => setTimeout(resolve, 400 * (round + 1)));
}
if (pending.length) throw new Error(`no quote for ${pending.slice(0, 12).join(", ")}`);

const listings = rows.map((row) => {
  const codeIsin = isin.get(row.ticker);
  if (marketOf.get(row.ticker) !== MARKET[row.exchange]) {
    throw new Error(`${row.ticker} quote is market ${marketOf.get(row.ticker)}, not ${row.exchange}`);
  }
  if (seen.has(codeIsin)) throw new Error(`repeated ${row.ticker} ${codeIsin}`);
  seen.add(codeIsin);
  return {
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    currency: "VND",
    type: row.type,
    isin: codeIsin,
    raw: [row.ticker, row.name, row.exchange, codeIsin, row.type].join(" "),
  };
});
listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("pinetree-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));

const byType = new Map();
for (const row of listings) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const skipped = [...leftOut].map(([kind, count]) => `${count} ${kind}`).join(", ");
console.error(
  `${listings.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). Left out: ${skipped || "none"}.`
);
