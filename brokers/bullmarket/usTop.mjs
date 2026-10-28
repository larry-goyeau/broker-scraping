// The N most popular titles of a US catalogue, for a broker that publishes
// no list but states how many US titles it offers ("más de 5.000 acciones y
// ETFs"). The owner's rule (2026-10-25): with a stated number, the
// catalogue of that place is the N most popular titles of that place, ranked
// by traded value, market capitalisation as the fallback.
//
// Traded value is the share volume FINRA publishes for every NMS symbol in
// its daily Reg SHO files (CNMSshvolYYYYMMDD.txt, the consolidated file of
// all FINRA trade-reporting facilities: the off-exchange part of the day's
// volume, shares and ETFs alike), averaged over the last ten files, times the
// last price of Nasdaq's stock and ETF screeners. Off-exchange volume is a
// share of the whole tape, so the value ranks titles rather than measuring
// them. A title with no FINRA volume or no price ranks after every title with
// one, by the market capitalisation the stock screener prints. The
// screeners' prices are kept in us-quotes.json next to this file for
// MAX_AGE_DAYS (Nasdaq's API turns away a busy address for a while).
//
//   https://cdn.finra.org/equity/regsho/daily/CNMSshvol20261023.txt
//   https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true
//   https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true
//
// Use:
//   import { topUs } from "../bullmarket/usTop.mjs";
//   const { rows, cut } = await topUs(usRows, 5000);
// rows keep their order of popularity; cut is the value of the last one kept.

import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FINRA = "https://cdn.finra.org/equity/regsho/daily/CNMSshvol";
const STOCKS = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true";
const FUNDS = "https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true";
const DAYS = 10;
const MAX_AGE_DAYS = 3;
const QUOTES = new URL("us-quotes.json", import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One spelling for the house ticker (BRK.B, JPM.PRC), FINRA's (BRK/B,
// JPMpC) and Nasdaq's screener (BRK/B, JPM^C).
export function usKey(symbol) {
  return String(symbol || "")
    .trim()
    .replace(/p([A-Z]*)$/, ".PR$1")
    .replace(/\^([A-Z]*)$/, ".PR$1")
    .toUpperCase()
    .replace(/[/\- ]+/g, ".");
}

async function get(url, { allow404 = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      if (allow404 && (response.status === 404 || response.status === 403)) return null;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// key -> average daily FINRA share volume over the last DAYS files.
async function finraVolumes() {
  const totals = new Map();
  const dates = [];
  const day = new Date();
  for (let back = 0; back < 30 && dates.length < DAYS; back += 1) {
    const date = new Date(day.getTime() - back * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
    const text = await get(`${FINRA}${date}.txt`, { allow404: true });
    if (!text) continue;
    const lines = text.trim().split(/\r?\n/);
    if (lines[0] !== "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market") throw new Error(`FINRA ${date} header is ${lines[0]}`);
    if (lines.length < 8000) throw new Error(`FINRA ${date} holds only ${lines.length} lines`);
    for (const line of lines.slice(1)) {
      const [, symbol, , , total] = line.split("|");
      const volume = Number(total);
      if (!symbol || !Number.isFinite(volume)) continue;
      const key = usKey(symbol);
      totals.set(key, (totals.get(key) || 0) + volume);
    }
    dates.push(date);
    await sleep(300);
  }
  if (dates.length < 5) throw new Error(`only ${dates.length} FINRA daily files in 30 days`);
  for (const [key, sum] of totals) totals.set(key, sum / dates.length);
  return { volumes: totals, dates };
}

const money = (value) => Number(String(value || "").replace(/[$,]/g, "")) || 0;

// key -> { price, cap } from Nasdaq's screeners.
async function screener() {
  try {
    const kept = JSON.parse(fs.readFileSync(QUOTES, "utf8"));
    const age = Date.now() - Date.parse(kept.built);
    if (age >= 0 && age < MAX_AGE_DAYS * 86_400_000) return new Map(Object.entries(kept.quotes));
  } catch {
    // none yet: ask Nasdaq
  }
  const quotes = new Map();
  const stocks = JSON.parse(await get(STOCKS)).data?.rows || [];
  for (const row of stocks) quotes.set(usKey(row.symbol), { price: money(row.lastsale), cap: money(row.marketCap) });
  const funds = JSON.parse(await get(FUNDS)).data?.data?.rows || [];
  for (const row of funds) if (!quotes.has(usKey(row.symbol))) quotes.set(usKey(row.symbol), { price: money(row.lastSalePrice), cap: 0 });
  if (stocks.length < 5000 || funds.length < 3000) throw new Error(`Nasdaq screeners hold ${stocks.length} stocks and ${funds.length} ETFs`);
  fs.writeFileSync(QUOTES, JSON.stringify({ built: new Date().toISOString(), quotes: Object.fromEntries(quotes) }));
  return quotes;
}

// The n most popular of rows (house US rows), most popular first.
export async function topUs(rows, n) {
  const { volumes, dates } = await finraVolumes();
  const quotes = await screener();
  const scored = rows.map((row) => {
    const key = usKey(row.ticker);
    const quote = quotes.get(key) || { price: 0, cap: 0 };
    return { row, value: (volumes.get(key) || 0) * quote.price, cap: quote.cap };
  });
  const valued = scored.filter((item) => item.value > 0).length;
  if (valued < rows.length * 0.8) throw new Error(`only ${valued} of ${rows.length} US rows have a FINRA volume and a price`);
  scored.sort((a, b) => b.value - a.value || b.cap - a.cap || a.row.ticker.localeCompare(b.row.ticker));
  for (const ticker of ["AAPL", "NVDA", "SPY", "QQQ"]) {
    const rank = scored.findIndex((item) => item.row.ticker === ticker);
    if (rank >= 0 && rank > 50) throw new Error(`${ticker} ranks ${rank + 1}: the traded values are wrong`);
  }
  const kept = scored.slice(0, n);
  return {
    rows: kept.map((item) => item.row),
    cut: kept.length ? kept[kept.length - 1].value : 0,
    dates,
    valued,
  };
}
