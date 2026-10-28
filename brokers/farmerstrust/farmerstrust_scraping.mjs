// What Farmers Bank & Trust (FB&T, Arkansas) sells in shares and
// exchange-traded products, with no login. Its investing is Unifimoney,
// "available within MyFarmers Online and Mobile Banking" (brokerage through
// Apex Clearing & Custody): "A Self-Directed account lets you select from
// available stocks, ETFs, and other investment options", besides a robo
// advisor, digital assets and precious metals.
//
//   https://www.myfarmers.bank/unifimoney
//
// The page names no list and no exception of its own. Unifimoney's
// self-managed page names the rules of its list (US exchange-listed, OTC
// not available, market value over $1 billion or else a three-month
// average daily dollar volume over $0.5 million, sponsored ADRs,
// non-leveraged ETFs), and the book applies them through
// ../capitolcredituni/unifimoneyBook.mjs, shared with Capitol Credit Union
// and First Fidelity Bank (its header quotes the page and says how each
// rule is read: shares by Nasdaq's screener with the last session's
// dollar volume standing in for the three-month average, leveraged ETFs
// and ETNs out). The US is one NBBO market: one row per title on its
// primary listing, in dollars.
//
//   https://www.unifimoney.com/invest/self-managed
//
// Remark, not a removal (it depends on the client): access is through
// MyFarmers Online or Mobile Banking ("Investments with Unifimoney" tile).
//
// Fees: "$0 commission online trading of U.S. listed stocks and ETFs
// (other fees may apply)" (self-managed page); "Trade Commissions on
// self-elected individual cash accounts: Free", ACAT out $50 (Unifimoney
// Fees & Limits schedule, June 2025, linked as "Fee schedule" from the
// legal library):
//   https://www.unifimoney.com/invest/self-managed
//   https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf
//   https://www.unifimoney.com/legal
//
//   node brokers/farmerstrust/farmerstrust_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { unifimoneyBook, evidence } from "../capitolcredituni/unifimoneyBook.mjs";

const PAGE = "https://www.myfarmers.bank/unifimoney";

await evidence(PAGE, [
  /Explore investment options through Unifimoney/i,
  /Self-Directed account lets you select from available stocks, ETFs/i,
  /Brokerage services by Apex Clearing/i,
]);

const book = await unifimoneyBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 5000) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "BRK.B", "SPY", "TSM"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("farmerstrust-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
const { directories, halts, fees, left } = book.report;
console.error(`directories ${JSON.stringify(directories)}; halts: ${halts.join(", ")}; fee schedule ${fees}`);
console.error(`left out ${left.small.length} small and thin shares, ${left.notScreened.length} lines the screener does not carry, ${left.leveraged.length} leveraged ETFs, ${left.etn.length} ETNs`);
