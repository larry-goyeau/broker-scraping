// What Capitol Credit Union (Austin, Texas) sells in shares and
// exchange-traded products, with no login. Its online investing is
// Unifimoney, embedded in CCU digital banking (brokerage through Apex
// Clearing): "From one secure platform, you can now invest in: Stocks and
// ETFs - Trade directly and diversify your portfolio", besides crypto and
// precious metals, and "Access to the program is exclusively available
// through the CCU mobile banking platform".
//
//   https://www.ccutx.org/invest/wealth-management/online-investing
//
// The CCU page names no list and no exception of its own. Unifimoney's
// self-managed page names the rules of its list (US exchange-listed, OTC
// not available, market value over $1 billion or else a three-month
// average daily dollar volume over $0.5 million, sponsored ADRs,
// non-leveraged ETFs), and the book applies them through
// ./unifimoneyBook.mjs (its header quotes the page and says how each rule
// is read: shares by Nasdaq's screener with the last session's dollar
// volume standing in for the three-month average, leveraged ETFs and ETNs
// out). The US is one NBBO market: one row per title on its primary
// listing, in dollars.
//
//   https://www.unifimoney.com/invest/self-managed
//
// Remarks, not removals (they depend on the client): CCU membership
// required, access through the CCU mobile banking platform only.
//
// Fees: "$0 commission online trading of U.S. listed stocks and ETFs
// (other fees may apply)" (self-managed page); "Trade Commissions on
// self-elected individual cash accounts: Free", ACAT out $50 (Unifimoney
// Fees & Limits schedule, linked as "Fee schedule" from the legal library):
//   https://www.unifimoney.com/invest/self-managed
//   https://www.unifimoney.com/legal
//
//   node brokers/capitolcredituni/capitolcredituni_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { unifimoneyBook, evidence } from "./unifimoneyBook.mjs";

const PAGE = "https://www.ccutx.org/invest/wealth-management/online-investing";

await evidence(PAGE, [
  /Online Investing with Unifimoney/i,
  /Stocks and ETFs - Trade directly/i,
  /Brokerage & securities through Apex Clearing/i,
]);

const book = await unifimoneyBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 5000) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "BRK.B", "SPY", "TSM"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("capitolcredituni-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
const { directories, halts, fees, left } = book.report;
console.error(`directories ${JSON.stringify(directories)}; halts: ${halts.join(", ")}; fee schedule ${fees}`);
console.error(`left out ${left.small.length} small and thin shares, ${left.notScreened.length} lines the screener does not carry, ${left.leveraged.length} leveraged ETFs, ${left.etn.length} ETNs`);
