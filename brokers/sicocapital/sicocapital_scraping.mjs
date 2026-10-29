// What SICO Capital (Riyadh, the Saudi arm of SICO BSC) sells in shares and
// ETFs, with no login: the Saudi Exchange's Main Market, its one place.
// Its brokerage page says "SICO Capital provides the trading platform to its
// customers to trade on the Saudi Tadawul Exchange via reliable e-channels
// that consist of secure internet trading, central trading units (CTUs) and
// a dedicated call center". It names no list of its own and no exclusion,
// so the book is the exchange's whole Main Market (shares, REITs and ETFs,
// less suspended lines), read by ../investsky/tadawulBook.mjs (what is kept
// and left out is written there). The Nomu parallel market is named nowhere
// on the site and is left out. Everything trades in riyals.
//
// Fees: "Schedule of Commission & Fees" (PDF linked from the brokerage
// page): SICO commission "0.00105 of the value of shares" and a trading
// commission of "0.0005 of the value of shares", before VAT ("The above fees
// do not include VAT").
//
//   https://www.sicocapital.com/en/our-brokerage-capabilities
//   https://www.sicocapital.com/media/SICO-Capital-Schedule-of-Commission--Fees.pdf
//
//   node brokers/sicocapital/sicocapital_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { tadawulBook } from "../investsky/tadawulBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const PAGE = "https://www.sicocapital.com/en/our-brokerage-capabilities";
const FEES = "https://www.sicocapital.com/media/SICO-Capital-Schedule-of-Commission--Fees.pdf";

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

const html = await (await get(PAGE)).text();
const page = textOf(html);
for (const pattern of [/trade on the Saudi Tadawul Exchange via reliable e-channels that consist of secure internet trading/, /Brokerage Commission & Fees Table/]) {
  if (!pattern.test(page)) throw new Error(`${PAGE} no longer says ${pattern}`);
}
if (!html.includes("SICO-Capital-Schedule-of-Commission--Fees.pdf")) throw new Error(`${PAGE} no longer links the commission schedule`);
const pdf = Buffer.from(await (await get(FEES)).arrayBuffer());
if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${FEES} is no longer a PDF`);
if (/\bNomu\b|parallel market/i.test(page)) console.error(`${PAGE} now names Nomu: consider adding it`);

const tadawul = await tadawulBook();
const kept = stampRows(withoutObligations(tadawul.rows));
const count = {};
for (const row of kept) count[`${row.exchange} ${row.type}`] = (count[`${row.exchange} ${row.type}`] || 0) + 1;
if ((count["Tadawul STOCK"] || 0) < 240 || (count["Tadawul ETF"] || 0) < 10) throw new Error(`short Tadawul book ${JSON.stringify(count)}`);
fs.writeFileSync(new URL("sicocapital-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `sicocapital: ${kept.length} rows; ${Object.entries(count).map(([key, value]) => `${key} ${value}`).join(", ")}. ` +
    `Left out: ${tadawul.suspended.join("; ") || "none"} (session ${tadawul.session}).`
);
