// What MAC African SGI sells in shares, with no login. The broker's
// market page (Bourse) fills its table from one public instrument call
// on the broker's own API host, and that call is the book: every line of
// the BRVM, with its group and its ISIN. Groups 750 and 752 are the
// shares, the two the page itself filters to under "Actions". Group 751
// is the bonds and 754 the subscription rights; they are other products
// and are not written. The BRVM lists no ETF.
//
//   https://macafricansgi.com/bourse/
//   https://macafricansgi.com/market/js/constants.js
//   https://public.macafricansgi.com/api/Instruments
//
//   node brokers/macafrican/macafrican_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const API = "https://public.macafricansgi.com/api/Instruments";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const SHARES = new Set(["750", "752"]);
const LEFT_OUT = { 751: "bonds", 754: "rights" };
const FLOOR = 44;

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Origin: "https://macafricansgi.com", Referer: "https://macafricansgi.com/bourse/" },
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

// The API writes an apostrophe it cannot encode as "?".
const clean = (value) => String(value ?? "").replace(/(\w)\?(\w)/g, "$1'$2").replace(/\s+/g, " ").trim();

const book = await getJson(API);
if (!Array.isArray(book) || book.length < 150) throw new Error(`${API} returned ${book?.length ?? 0} instruments`);

const leftOut = new Map();
const rows = [];
const seen = new Set();
for (const line of book) {
  const group = clean(line.groupe);
  if (!SHARES.has(group)) {
    const label = LEFT_OUT[group];
    if (!label) throw new Error(`unknown group ${group || "(none)"} on ${line.symbol}`);
    leftOut.set(label, (leftOut.get(label) || 0) + 1);
    continue;
  }
  const ticker = clean(line.symbol).toUpperCase();
  const name = clean(line.fullName);
  const isin = clean(line.isinCode).toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(ticker) || !name) throw new Error(`unreadable share ${JSON.stringify(line).slice(0, 160)}`);
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${ticker} has ISIN ${isin || "(none)"}`);
  if (seen.has(ticker) || seen.has(isin)) throw new Error(`${ticker} ${isin} repeats`);
  seen.add(ticker);
  seen.add(isin);
  rows.push({
    query: isin,
    ticker,
    name,
    exchange: "BRVM",
    mic: "XBRV",
    currency: "XOF",
    type: "STOCK",
    isin,
    raw: [ticker, name, isin, `groupe ${group}`, "BRVM"].join(" "),
  });
}
if (rows.length < FLOOR) throw new Error(`only ${rows.length} BRVM shares`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("macafrican-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const skipped = [...leftOut].map(([label, value]) => `${value} ${label}`).join(", ");
console.error(`${rows.length} listings: BRVM STOCK ${rows.length}. Left out: ${skipped || "none"}.`);
