// What BTK Conseil sells in shares, with no login. The broker's book is
// the Bourse de Tunis. Its "Bourse de Tunis" page prints the list of
// instruments from its own market feed, which answers as JSON. The feed
// holds every BVMT line: shares, bonds (group 21) and rights (group 32).
// Only the four share groups are kept: 11 (continuous), 12, 13 and 99
// (fixing). The feed must hold the same shares, tickers and groups as
// the exchange's own board, or the run stops. Suspended shares are
// dropped: those the feed marks state 8 and those the BVMT board marks
// status "S" (quotation suspended by the exchange or the CMF). Reserved
// lines (feed state 9, board status "R": price limit hit) are intraday
// only and stay. Any other state or status code stops the run. The
// Bourse de Tunis lists no ETF. Every row is quoted in dinars. Fees: brokerage 0.4% to 0.8% on
// shares, in article 7 of the free-account convention.
//
//   https://www.btkconseil.com/nos-produits/compte-libres/
//   https://www.btkconseil.com/download/convention-compte-libre-cea/
//   https://www.btkconseil.com/bourse-de-tunis/
//   https://market.btkconseil.com/api/Instruments
//   https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99
//
//   node brokers/btkconseil/btkconseil_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const FEED = "https://market.btkconseil.com/api/Instruments";
const BOARD = "https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99";
const SHARES = new Set(["11", "12", "13", "99"]);
const OTHERS = new Set(["21", "32"]);
// Feed states seen on share lines: 3 and 5 trading (fixing, continuous),
// 9 reserved, 8 suspended.
const STATES = new Set(["3", "5", "8", "9"]);
// Board statuses: blank trading, R reserved, S suspended.
const STATUSES = new Set(["", "R", "S"]);
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
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || url);
}

function btkShares(json) {
  const rows = JSON.parse(json);
  if (!Array.isArray(rows) || rows.length < 300) throw new Error(`BTK feed printed ${rows?.length ?? 0} instruments`);
  const listings = [];
  const seen = new Set();
  for (const row of rows) {
    const group = String(row.groupe ?? "").trim();
    if (OTHERS.has(group)) continue;
    if (!SHARES.has(group)) throw new Error(`${row.symbol} is in group ${group || "unmarked"}, unknown to this scraper`);
    const ticker = String(row.symbol || "").trim().toUpperCase();
    const isin = String(row.isinCode || "").trim().toUpperCase();
    const name = String(row.fullName || "").replace(/\s+/g, " ").trim();
    if (!ticker || !name) throw new Error(`unreadable listing ${JSON.stringify(row.symbol)}`);
    if (!/^TN[A-Z0-9]{10}$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
    const state = String(row.state ?? "").trim();
    if (!STATES.has(state)) throw new Error(`${ticker} has feed state ${state || "unmarked"}, unknown to this scraper`);
    if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    seen.add(isin);
    listings.push({
      query: ticker,
      ticker,
      name,
      exchange: "Tunis",
      currency: "TND",
      type: "STOCK",
      isin,
      mic: "XTUN",
      state,
      raw: [ticker, name, "Tunis", isin, `group ${group}`, "STOCK"].join(" "),
    });
  }
  if (listings.length < 60) throw new Error(`BTK feed printed ${listings.length} shares`);
  listings.sort((left, right) => left.ticker.localeCompare(right.ticker));
  return listings;
}

// The exchange board is the reference: same ISINs, same tickers. It
// returns the ISINs whose quotation the exchange has suspended.
function checkBoard(listings, json) {
  const board = JSON.parse(json)?.markets;
  if (!Array.isArray(board) || board.length < 60) throw new Error(`BVMT printed ${board?.length ?? 0} shares`);
  const tickers = new Map(board.map((row) => [String(row.referentiel?.isin || "").trim().toUpperCase(), String(row.referentiel?.ticker || "").trim().toUpperCase()]));
  const mine = new Map(listings.map((row) => [row.isin, row.ticker]));
  const missing = [...tickers].filter(([isin]) => !mine.has(isin)).map(([, ticker]) => ticker);
  const extra = [...mine].filter(([isin]) => !tickers.has(isin)).map(([, ticker]) => ticker);
  const renamed = [...mine].filter(([isin, ticker]) => tickers.has(isin) && tickers.get(isin) !== ticker).map(([, ticker]) => ticker);
  if (missing.length || extra.length || renamed.length) {
    throw new Error(`BTK feed and BVMT board differ: missing ${missing.join(",") || "-"}, extra ${extra.join(",") || "-"}, other ticker ${renamed.join(",") || "-"}`);
  }
  const suspended = new Set();
  for (const row of board) {
    const status = String(row.status ?? "").trim().toUpperCase();
    const ticker = String(row.referentiel?.ticker || "").trim().toUpperCase();
    if (!STATUSES.has(status)) throw new Error(`BVMT board gives ${ticker} status ${JSON.stringify(row.status)}, unknown to this scraper`);
    if (status === "S") suspended.add(String(row.referentiel?.isin || "").trim().toUpperCase());
  }
  return suspended;
}

const all = btkShares(await get(FEED));
const boardSuspended = checkBoard(all, await get(BOARD));
const byFeed = all.filter((row) => row.state === "8").map((row) => row.ticker);
const byBoard = all.filter((row) => boardSuspended.has(row.isin)).map((row) => row.ticker);
const listings = all
  .filter((row) => row.state !== "8" && !boardSuspended.has(row.isin))
  .map(({ state, ...row }) => row);
fs.writeFileSync(new URL("btkconseil-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
console.error(
  `${listings.length} listings (${listings.length} STOCK, Tunis ${listings.length}); dropped ${all.length - listings.length} suspended ` +
    `(feed state 8: ${byFeed.join(",") || "-"}; BVMT status S: ${byBoard.join(",") || "-"})`
);
