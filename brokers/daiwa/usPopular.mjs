// How popular each US line is, to keep the N most traded titles of the US
// book for a broker that publishes no list but states how many US names it
// offers ("ETFを含め約2,000銘柄", "美股標的8000+"). Shared by the Daiwa,
// SMBC Nikko and Pocket Securities scrapers.
//
// Popularity is traded value: average daily shares traded times the price.
//   - Shares: FINRA's Reg SHO daily files (CNMSshvolYYYYMMDD.txt), one per
//     trading day, every NMS symbol, stocks and ETFs alike. TotalVolume is
//     the volume reported to the FINRA trade reporting facilities, that is
//     the off-exchange part of the day (about half of the consolidated
//     volume for most names). The last 20 files are averaged (a symbol
//     absent from a file traded nothing off-exchange that day). It ranks
//     the titles; it is not their full volume.
//   - Price: the last price of Cboe's four US equity books (BZX, BYX, EDGX,
//     EDGA symbol summaries), else the last close in ../../assets/prices.json
//     for the row's ISIN.
// A line with no FINRA volume or no price scores 0 and ranks last, by
// ticker. Ties keep the ticker order.
//
// FINRA writes BRK/B for BRK.B and NLYpG for the preferred NLY.PRG (NLY$G
// in Nasdaq Trader's directories); Cboe writes BRK.B and NLY-G.
//
//   https://cdn.finra.org/equity/regsho/daily/CNMSshvol20261023.txt
//   https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data/daily-short-sale-volume-files
//   https://www.cboe.com/us/equities/market_statistics/symbol_data/csv/?mkt=bzx
//
// Use:
//   import { usPopularity, topByPopularity } from "../daiwa/usPopular.mjs";
//   const scores = await usPopularity(rows);        // Map ticker -> { value, volume, price, days }
//   const { kept, cut } = topByPopularity(rows, scores, 2000);

import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const FINRA = (ymd) => `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${ymd}.txt`;
const CBOE = (market) => `https://www.cboe.com/us/equities/market_statistics/symbol_data/csv/?mkt=${market}`;
const PRICES = new URL("../../assets/prices.json", import.meta.url);
const DAYS = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, { optional = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      if (optional && (response.status === 403 || response.status === 404)) return null;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

// The directory's ACT symbol (first field of a usBook row's raw) is the
// key; the house ticker stands in when raw has none.
function actOf(row) {
  return String(row.raw || "").split(" | ")[0].trim() || row.ticker;
}

function finraSymbol(act) {
  return act.replace(/\$/, "p").replace(/\./g, "/");
}

function cboeSymbol(act) {
  return act.replace(/\$/, "-");
}

// The last `DAYS` FINRA files, walking back from New York's today.
async function finraVolumes() {
  const totals = new Map();
  const dates = [];
  const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()) + "T12:00:00Z");
  for (let back = 0; back < 45 && dates.length < DAYS; back += 1) {
    const day = new Date(today.getTime() - back * 86_400_000);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const ymd = day.toISOString().slice(0, 10).replace(/-/g, "");
    const text = await get(FINRA(ymd), { optional: true });
    if (!text) continue;
    const lines = text.trim().split(/\r?\n/);
    if (!/^Date\|Symbol\|ShortVolume\|ShortExemptVolume\|TotalVolume\|Market/.test(lines[0])) {
      throw new Error(`FINRA file ${ymd} has the header ${lines[0]}`);
    }
    for (const line of lines.slice(1)) {
      const [, symbol, , , total] = line.split("|");
      const volume = Number(total);
      if (symbol && volume > 0) totals.set(symbol, (totals.get(symbol) || 0) + volume);
    }
    if (lines.length < 8000) throw new Error(`FINRA file ${ymd} has only ${lines.length} lines`);
    dates.push(ymd);
    await sleep(300);
  }
  if (dates.length < 10) throw new Error(`only ${dates.length} FINRA daily files found`);
  return { totals, dates };
}

async function cboeLastPrices() {
  const prices = new Map();
  for (const market of ["bzx", "byx", "edgx", "edga"]) {
    const text = await get(CBOE(market));
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const columns = head.split(",");
    const name = columns.indexOf("Name");
    const last = columns.indexOf("Last Price");
    if (name < 0 || last < 0) throw new Error(`Cboe ${market} symbol file has the header ${head}`);
    for (const line of lines) {
      const cells = line.split(",");
      const price = Number(cells[last]);
      if (price > 0 && !prices.has(cells[name])) prices.set(cells[name], price);
    }
    await sleep(300);
  }
  if (prices.size < 6000) throw new Error(`Cboe symbol files priced only ${prices.size} symbols`);
  return prices;
}

function closesByIsin() {
  const book = JSON.parse(fs.readFileSync(PRICES, "utf8")).prices || {};
  const out = new Map();
  for (const [isin, byCurrency] of Object.entries(book)) if (byCurrency?.USD?.price > 0) out.set(isin, byCurrency.USD.price);
  return out;
}

export async function usPopularity(rows) {
  const [{ totals, dates }, cboe] = [await finraVolumes(), await cboeLastPrices()];
  const closes = closesByIsin();
  const scores = new Map();
  for (const row of rows) {
    const act = actOf(row);
    const volume = (totals.get(finraSymbol(act)) || 0) / dates.length;
    const price = cboe.get(cboeSymbol(act)) || closes.get(row.isin) || 0;
    scores.set(row.ticker, { value: volume * price, volume, price });
  }
  scores.dates = dates;
  const traded = [...scores.values()].filter((score) => score.value > 0).length;
  if (traded < rows.length * 0.6) throw new Error(`only ${traded} of ${rows.length} US lines have a traded value`);
  return scores;
}

// The `n` rows with the highest traded value; `cut` is the rest.
export function topByPopularity(rows, scores, n) {
  const ranked = [...rows].sort(
    (left, right) =>
      (scores.get(right.ticker)?.value || 0) - (scores.get(left.ticker)?.value || 0) || left.ticker.localeCompare(right.ticker)
  );
  return { kept: ranked.slice(0, n), cut: ranked.slice(n) };
}
