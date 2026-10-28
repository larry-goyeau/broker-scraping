// What Mondeum Capital (Mondeum Pro, a direct-access broker for active
// traders on DAS Trader Pro and Sterling Trader Pro) sells in shares and
// exchange-traded products, with no login. Its pages speak of "equity and
// ETF trading" ("efficient execution of all your equity and ETF
// strategies", overview), and the FAQ names what is not tradable: "traders
// are prohibited from trading over-the-counter (OTC) stocks (e.g., pink
// sheets and bulletin boards) and low average daily volume stocks (i.e.,
// securities trading under 100,000 shares per day using a rolling 30-day
// average)".
//
//   https://www.mondeumcapital.com/overview/
//   https://www.mondeumcapital.com/faqs/
//
// So the catalogue is the US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, less every line whose 30-day average
// daily volume is under 100,000 shares. The averages are read in one
// request from TradingView's public US scanner (average_volume_30d_calc;
// the 10-day average when a line is too new to have a 30-day one). A line
// the scanner does not carry, or carries with no average at all, is kept
// and counted: nothing says it is under the bar. The rule is the broker's,
// not the client's, so it is a removal; the set moves from day to day.
//
//   https://scanner.tradingview.com/america/scan
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are out by the FAQ. The US is one
// NBBO market: one row per title, on its primary listing, in dollars.
//
// Remark, not a removal: accounts must keep "a minimum equity balance of
// $25,000 to maintain trading permissions" (FAQ).
//
// Fees ("Commission 0.0005 per share", plus per-route add/take fees,
// pass-through SEC, TAF, NSCC and per-share administrative and reporting
// fees, platform and market data fees):
//   https://www.mondeumcapital.com/pricing/
//
//   node brokers/mondeum/mondeum_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SCANNER = "https://scanner.tradingview.com/america/scan";
const MIN_VOLUME = 100_000;
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

async function get(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...(init.headers || {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const text = (await (await get(url)).text()).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.mondeumcapital.com/faqs/", [
  /prohibited from trading over-the-counter \(OTC\) stocks/i,
  /securities trading under 100,000 shares per day using a rolling 30-day average/i,
]);
await pause();
await evidence("https://www.mondeumcapital.com/pricing/", [/Commission 0\.0005 per share/i]);
await pause();

// 30-day average volume of every US exchange line, keyed by TradingView's
// symbol spelling (a preferred is "NLY/PG" where the book writes "NLY.PRG").
async function averageVolumes() {
  const body = {
    columns: ["name", "average_volume_30d_calc", "average_volume_10d_calc"],
    filter: [{ left: "exchange", operation: "in_range", right: ["NASDAQ", "NYSE", "AMEX", "CBOE", "TXSE"] }],
    range: [0, 30000],
    sort: { sortBy: "name", sortOrder: "asc" },
  };
  const json = await (
    await get(SCANNER, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) })
  ).json();
  if (!Array.isArray(json.data) || json.data.length < 10000) throw new Error(`scanner returned ${json.data?.length} lines`);
  const out = new Map();
  for (const { d } of json.data) {
    const [name, avg30, avg10] = d;
    const value = avg30 ?? avg10 ?? null;
    if (!out.has(name) || (value ?? -1) > (out.get(name) ?? -1)) out.set(name, value);
  }
  return out;
}
const scannerKey = (ticker) => ticker.replace(/\.PR([A-Z]?)$/, "/P$1");

const volumes = await averageVolumes();
const book = await usBook();
const kept = [];
const unknown = [];
let low = 0;
for (const row of book) {
  const volume = volumes.get(scannerKey(row.ticker));
  if (volume == null) {
    unknown.push(row.ticker);
    kept.push(row);
  } else if (volume >= MIN_VOLUME) kept.push(row);
  else low++;
}
const rows = stampRows(withoutObligations(kept));
if (rows.length < 3000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("mondeum-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
console.error(`left out ${low} lines under ${MIN_VOLUME} shares a day (30-day average)`);
console.error(`kept ${unknown.length} lines with no average volume: ${unknown.slice(0, 40).join(" ")}${unknown.length > 40 ? " ..." : ""}`);
if (rows.length < kept.length) console.error(`${kept.length - rows.length} bonds left out`);
