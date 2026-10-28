// What Opencash (Opencash Securities LLC; clearing RQD* Clearing) sells in
// shares and exchange-traded products, with no login. Its Customer
// Relationship Summary says the app is for orders "to buy and sell stocks,
// exchange-traded funds (“ETFs”), and other securities or investment
// strategies such as using options", and the fee schedule prices "US Listed
// (Stocks and ETFs)" at $0. No page names a board, a segment or a kind of
// listed share or fund left out, so the catalogue is the whole US exchange
// book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// partnership units, preferreds, closed-end funds, ETFs and ETNs on Nasdaq,
// NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock Exchange,
// less the lines with an open trade halt. The app's list itself is not
// public.
//
//   https://support.opencash.com/article/71-ocs-customer-relationship-summary
//   https://support.opencash.com/article/78-ocs-exchange-traded-products-risk-disclosure
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the fee schedule
// speaks of "US Listed" stocks and ETFs only. The US is one NBBO market:
// one row per title, on its primary listing, in dollars.
//
// Fees ("US Listed (Stocks and ETFs) $0", "Regulatory and TAF $0*", the
// firm paying SEC, FINRA, routing and clearing fees; "ACATS (account
// transfer), Outbound $80"). The CRS also says "Opencash does not charge
// commissions for executing buy and sell orders", although an older help
// article still lists "Commissions charged on each trade" among its
// revenues:
//   https://opencash.com/ocs_fee_schedule_updated_march_2026.pdf   (linked from opencash.com's footer, "Fee Schedule")
//
//   node brokers/opencash/opencash_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CRS = "https://support.opencash.com/article/71-ocs-customer-relationship-summary";
const FEES = "https://opencash.com/ocs_fee_schedule_updated_march_2026.pdf";

// The CRS still says what the header quotes and the fee schedule is still
// online, or the run stops.
async function get(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}
const crs = (await (await get(CRS)).text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
for (const pattern of [/buy and sell stocks, exchange-traded funds/i, /does not charge commissions/i]) {
  if (!pattern.test(crs)) throw new Error(`${CRS} no longer says ${pattern}`);
}
await new Promise((resolve) => setTimeout(resolve, 1000));
const pdf = await get(FEES);
if (!/pdf/i.test(pdf.headers.get("content-type") || "")) throw new Error(`${FEES} is no longer a PDF`);
await pdf.arrayBuffer();

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("opencash-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
