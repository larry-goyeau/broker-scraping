// What VFEX Direct sells, with no login. VFEX Direct is the Victoria
// Falls Stock Exchange's own app. It buys and sells what trades on VFEX,
// in US dollars only. The app's public price sheet is that board: it
// groups the lines as EQUITY, ETF and REIT, and each line has the
// ticker and the ISIN. A REIT is a listed trust unit traded like a
// share, so it is written as a stock. Depository receipts (Caledonia,
// Invictus, Nedbank) sit with the equities and are kept as shares.
//
// The exchange's own price sheet is read too, to say what the app does
// not carry. Its only extra line today is the Karo Mining note, which is
// debt. Bindura Nickel (halted) and Edgars (listing terminated in
// September 2026) are in the issuer directory but on neither sheet, so
// they are not written.
//
// Fees: the VFEX retail investor guide prints the dealer commission and
// levies for a VFEX trade, and the VFEX Direct terms (8.10) add a 2%
// administrative fee on gross sale proceeds.
//
//   https://vfexdirect.vfex.exchange/
//   https://vfexdirect.vfex.exchange/terms-and-conditions
//   https://ds88jcmqc11je.cloudfront.net/api/notices/19/download
//   https://d3u8q0mxu6epjj.cloudfront.net/api/v1/voms/price-sheets/active
//   https://ds88jcmqc11je.cloudfront.net/api/fetch/price-sheet?exchange=VFEX
//   https://ds88jcmqc11je.cloudfront.net/api/faqs?exchange=VFEX&category=General
//
//   node brokers/vfexdirect/vfexdirect_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SHEET = "https://d3u8q0mxu6epjj.cloudfront.net/api/v1/voms/price-sheets/active";
const BOARD = "https://ds88jcmqc11je.cloudfront.net/api/fetch/price-sheet?exchange=VFEX";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const GROUP_TYPE = { EQUITY: "STOCK", ETF: "ETF", REIT: "STOCK" };
// Exchange board markets: 1 equities, 41 ETFs, 43 REITs. Others are debt.
const BOARD_MARKETS = new Set([1, 41, 43]);

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
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

const sheetBody = await getJson(SHEET);
const groups = sheetBody?.data;
if (!groups || typeof groups !== "object" || Array.isArray(groups)) throw new Error(`${SHEET} has no grouped price sheet`);

const rows = [];
const seen = new Set();
for (const [group, lines] of Object.entries(groups)) {
  const type = GROUP_TYPE[group];
  if (!type) throw new Error(`unknown price sheet group ${group}`);
  if (!Array.isArray(lines)) throw new Error(`${group} is not a list`);
  for (const line of lines) {
    if (String(line.status || "").toUpperCase() !== "ACTIVE") continue;
    if (String(line.securitySubType || "").toUpperCase() !== group) throw new Error(`${line.symbol} is ${line.securitySubType} under ${group}`);
    const ticker = String(line.symbol || "").trim().toUpperCase();
    const isin = String(line.isin || "").trim().toUpperCase();
    const name = String(line.symbolName || "").replace(/\s+/g, " ").trim();
    if (!/^[A-Z0-9]+\.VX$/.test(ticker) || !name) throw new Error(`unreadable line ${JSON.stringify(line.symbol)}`);
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
    if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    seen.add(isin);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: "VFEX",
      currency: "USD",
      type,
      isin,
      mic: "VFEX",
      raw: [ticker, name, "VFEX", isin, group].join(" "),
    });
  }
}
if (rows.length < 15) throw new Error(`VFEX Direct printed ${rows.length} lines`);

const board = (await getJson(BOARD))?.data;
if (!Array.isArray(board) || board.length < 15) throw new Error(`${BOARD} printed ${board?.length ?? 0} lines`);
const notInApp = board
  .filter((line) => BOARD_MARKETS.has(line.marketId) && !seen.has(String(line.isin || "").trim().toUpperCase()))
  .map((line) => `${line.name} ${line.isin}`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("vfexdirect-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const byType = new Map();
for (const row of rows) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${rows.length} listings on VFEX (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). ` +
    `On the exchange board and not in the app: ${notInApp.join("; ") || "none"}.`
);
