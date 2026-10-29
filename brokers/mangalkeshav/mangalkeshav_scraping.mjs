// What Mangal Keshav (India) sells in shares and ETFs, with no login. It
// publishes no scrip master and no list of what it carries.
//
// NSE and BSE. The home page links its brokerage plan PDF: five slabs set by
// upfront margin, "Delivery Equity Cash/Futures Segment" from 0.10% (slab 1,
// ₹1,00,000) to 0.50% (slab 5, ₹5,000), intraday 0.01% to 0.05%. It offers
// mobile and web trading and excludes no segment, group or kind of listed
// share, so the book is the whole NSE and BSE cash book of the day, shares
// and ETFs, minus suspended, delisted and not-yet-listed lines, rights
// entitlements and fund units that are not ETFs (../bajaj/indiaBook.mjs).
// One row per exchange for a title on both, in INR.
//
// No US or other foreign place: Mangal Keshav offers Indian cash,
// derivatives, currency and commodity only.
//
//   https://www.mangalkeshav.com/
//   https://www.mangalkeshav.com/assets/pdf/brokerage-plan.pdf
//
//   node brokers/mangalkeshav/mangalkeshav_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.mangalkeshav.com/", [/assets\/pdf\/brokerage-plan\.pdf/i], { raw: true });

// The fee schedule is a PDF; it must still be there.
const pdf = await fetch("https://www.mangalkeshav.com/assets/pdf/brokerage-plan.pdf", { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Range: "bytes=0-1023" }, signal: AbortSignal.timeout(60_000) });
if (!pdf.ok || !(await pdf.text()).startsWith("%PDF")) throw new Error(`the brokerage PDF is gone: ${pdf.status}`);

const india = wholeIndia(await indiaLists());
const rows = stampRows(withoutObligations(india));
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("mangalkeshav-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
