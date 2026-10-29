// The Bourse de Tunis (BVMT, MIC XTUN) share book, read from the exchange's
// own market feed, no login:
//
//   https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99
//
// Shares trade in four groups: 11 and 12 (continuous), 13 and 99
// (fixing). Every line of those groups is a share, with its ticker, name
// and ISIN in the exchange's referential; bonds (group 21) and rights and
// other entitlements (group 32) are other groups and stay out. The BVMT
// lists no ETF.
//
// The board's status field: blank while trading; "R" reserved (a price
// limit was hit), "C" closed for the session (a fixing group after its
// fixing, seen on 2026-10-28 after 12:20), both intraday and kept; "S"
// quotation suspended by the exchange or the CMF, left out. Any other code
// stops the run, so its meaning gets checked. Every line trades in dinars.
//
// Use from a scraper:
//   import { bvmtBook } from "../bnacapitaux/bvmtBook.mjs";
//   const { rows, suspended } = await bvmtBook();
//
//   node brokers/bnacapitaux/bvmtBook.mjs   (prints the book)

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const BOARD = "https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99";
const GROUPS = new Set(["11", "12", "13", "99"]);
// blank trading, R reserved, C closed for the session, S suspended
const STATUSES = new Set(["", "R", "C", "S"]);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "60", "-A", UA, url], { maxBuffer: 32_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last || url);
}

// { rows (sorted by ticker), suspended: [ticker], byGroup: {group: n} }
export async function bvmtBook() {
  const lines = JSON.parse(await get(BOARD))?.markets;
  if (!Array.isArray(lines) || lines.length < 60) throw new Error(`BVMT printed ${lines?.length ?? 0} shares`);
  const rows = [];
  const suspended = [];
  const byGroup = {};
  const seen = new Set();
  for (const line of lines) {
    const ref = line.referentiel || {};
    const group = String(ref.valGroup || "").trim();
    const ticker = String(ref.ticker || "").trim().toUpperCase();
    const isin = String(ref.isin || line.isin || "").trim().toUpperCase();
    const name = String(ref.stockName || "").replace(/\s+/g, " ").trim();
    if (!GROUPS.has(group)) throw new Error(`${ticker} is in group ${group || "unmarked"}, not a share group`);
    if (!ticker || !name) throw new Error(`unreadable BVMT line ${JSON.stringify(ref).slice(0, 200)}`);
    if (!/^TN[A-Z0-9]{9}[0-9]$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
    if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    seen.add(isin);
    const status = String(line.status ?? "").trim().toUpperCase();
    if (!STATUSES.has(status)) throw new Error(`BVMT gives ${ticker} status ${JSON.stringify(line.status)}, unknown to this book`);
    if (status === "S") {
      suspended.push(ticker);
      continue;
    }
    byGroup[group] = (byGroup[group] || 0) + 1;
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: "Tunis",
      mic: "XTUN",
      currency: "TND",
      type: "STOCK",
      isin,
      raw: [ticker, name, "Tunis", isin, `group ${group}`, "STOCK"].join(" "),
    });
  }
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  for (const ticker of ["BIAT", "SFBT", "PGH", "ATB", "TLNET"]) {
    if (!rows.some((row) => row.ticker === ticker) && !suspended.includes(ticker)) throw new Error(`BVMT book misses ${ticker}`);
  }
  if (suspended.length > 15) throw new Error(`${suspended.length} BVMT shares suspended: the status field changed meaning`);
  return { rows, suspended: suspended.sort(), byGroup };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const book = await bvmtBook();
  console.log(`${book.rows.length} BVMT shares ${JSON.stringify(book.byGroup)}; suspended: ${book.suspended.join(", ") || "none"}`);
}
