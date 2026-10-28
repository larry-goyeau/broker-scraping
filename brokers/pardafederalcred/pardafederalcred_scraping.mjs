// What Parda Federal Credit Union (Michigan) sells in shares and
// exchange-traded products, with no login. Its investing is Unifimoney,
// opened from a tile in Parda's online and mobile banking ("Brokerage
// services are provided by Apex Clearing & Custody, Inc."): "Self-Directed
// Stocks & ETFs ... Trade stocks and ETFs with a self-directed account",
// besides a robo adviser and crypto (crypto and precious metals are not
// here).
//
//   https://www.parda.com/invest
//
// The Parda page names no list and no exception of its own. Unifimoney's
// self-managed page names the rules of its list ("Available securities are
// limited to a predefined list determined by Unifimoney and the
// custodian": "US exchange listed (OTC securities are not available)",
// "Market capitalization greater than $ 1 billion", or below that a
// "3 month average daily dollar volume" over $0.5 million, "Exchange listed
// sponsored ADRs", "Non-leveraged ETFs"). The book applies them through
// ../capitolcredituni/unifimoneyBook.mjs, shared with Capitol Credit Union
// (its header quotes the page and says how each rule is read: shares by
// Nasdaq's screener with the last session's dollar volume standing in for
// the three-month average, leveraged ETFs and ETNs out). The US is one
// NBBO market: one row per title on its primary listing, in dollars.
//
//   https://www.unifimoney.com/invest/self-managed
//
// Remarks, not removals (they depend on the client): Parda membership and
// online or mobile banking required; "You can invest as little as $5".
//
// Fees: "Trade Commissions on self-elected individual cash accounts: Free",
// ACAT out $50 one-time (Unifimoney Fees & Limits schedule, the fee link
// of the Parda listing, also linked from Unifimoney's legal library).
//
//   https://cdn.prod.website-files.com/5f4e5d12d2aa66dc46fd603b/697bbecfa3e2a96c63fc1cf4_Unifimoney%20Fees%20and%20Limits%20Schedule%20Jun%202025.docx.pdf
//   https://www.unifimoney.com/legal
//
//   node brokers/pardafederalcred/pardafederalcred_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { unifimoneyBook, evidence } from "../capitolcredituni/unifimoneyBook.mjs";

const PAGE = "https://www.parda.com/invest";

await evidence(PAGE, [
  /Parda has partnered with Unifimoney/i,
  /Self-Directed Stocks &(amp;)? ETFs/i,
  /Trade stocks and ETFs with a self-directed account/i,
  /Brokerage services are provided by Apex Clearing/i,
]);

const book = await unifimoneyBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 5000) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "BRK.B", "SPY", "TSM"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("pardafederalcred-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
const { directories, halts, fees, left } = book.report;
console.error(`directories ${JSON.stringify(directories)}; halts: ${halts.join(", ")}; fee schedule ${fees}`);
console.error(`left out ${left.small.length} small and thin shares, ${left.notScreened.length} lines the screener does not carry, ${left.leveraged.length} leveraged ETFs, ${left.etn.length} ETNs`);
