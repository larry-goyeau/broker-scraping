// Coris Bourse shows the BRVM price list on its site, filled from one public
// JSON call on its own host, with no login. With instrument_type=equity that
// call is every share of the BRVM, with its name and its trading status; the
// same call without the filter also carries the bonds, which are not
// written. The BRVM lists no ETF. A share whose status is "Suspended" is
// left out; a "Dynamically halted" share is an intraday pause and stays.
// The call gives no ISIN.
//
//   https://www.coris-bourse.com/en/informations-financieres/cours-brvm
//   https://coris-bourse.com/api/v1/market/quotes?instrument_type=equity&per_page=100
//
//   node brokers/corisbourse/corisbourse_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const API = "https://coris-bourse.com/api/v1/market/quotes?instrument_type=equity&per_page=100";
const FLOOR = 44;
const KNOWN = ["SNTS", "ORAC", "SGBC"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.coris-bourse.com/en/informations-financieres/cours-brvm" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

// The API caps a page at 50 lines; follow next_page_url in case the list grows.
const lines = [];
let url = API;
let announced = 0;
for (let page = 0; url && page < 20; page += 1) {
  const body = await getJson(url);
  announced = Number(body.total);
  lines.push(...(body.data || []));
  url = body.next_page_url ? `${body.next_page_url}&instrument_type=equity&per_page=100` : "";
  if (url) await sleep(400);
}
if (!announced || lines.length !== announced) throw new Error(`API announced ${announced}, read ${lines.length}`);

const rows = [];
const seen = new Set();
const suspended = [];
for (const line of lines) {
  if (line.instrument_type !== "equity") continue;
  const ticker = String(line.symbol || "").trim().toUpperCase();
  if (!ticker || seen.has(ticker)) continue;
  seen.add(ticker);
  if (/suspend/i.test(line.status || "")) {
    suspended.push(ticker);
    continue;
  }
  const name = String(line.description || "").replace(/\s+/g, " ").trim();
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: "BRVM",
    mic: "XBRV",
    currency: "XOF",
    type: "STOCK",
    isin: "",
    raw: [ticker, name, line.instrument_type, line.status].join(" | "),
  });
}

if (rows.length < FLOOR) throw new Error(`only ${rows.length} BRVM shares`);
for (const ticker of KNOWN) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("corisbourse-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error({ "BRVM STOCK": rows.length, suspended });
