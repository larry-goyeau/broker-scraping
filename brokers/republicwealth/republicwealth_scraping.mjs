// What Republic Wealth Management sells in shares and exchange-traded
// funds, with no login. Republic Wealth Management (Republic Financial
// Holdings group) is a Trinidad and Tobago Stock Exchange member. Its
// "Brokerage Services Local Equity" page sells TTSE shares: orders go "by
// phone, via e-mail ... or via online trading (TOP)", TOP being the TTSE
// Online Platform. It publishes no list of its own, and neither that page
// nor its brokerage FAQ (PDF) names a board, segment or security type it
// does not trade; the FAQ sends clients to the TTSE Daily Market Quote for
// prices and names cross-listed shares such as GraceKennedy. So the book is
// the whole TTSE board, read by ttseBook.mjs: every Ordinary, Preference,
// Second Tier, SME, Mutual Fund and USD Equity line, minus suspended lines
// (MOV and CALYP today), de-listed and never-traded lines. Bonds are not
// read; no right, ETF, ETN or ETC is listed on the TTSE. The two Eppley
// Caribbean Property Fund cells (CPFD, CPFV) on the Mutual Fund board are
// closed-end fund shares traded on the exchange like any share: kept, as
// FUND. Currency is the board's: TTD, USD on the USD Equity board. Only
// 8 rows carry an ISIN (the TTSE prints none; see ttseBook.mjs).
//
// Fees (same page and the FAQ): online, TTCD fee 0.21% plus broker 0.75%;
// through a broker, 0.21% exchange fee plus 1.50% on the first $50,000,
// 1.25% on the second $50,000, 1.00% above $100,000, flat $10 under $650.
// TTD$35,000 minimum opening amount; TTD$35 per company to deposit share
// certificates.
//
//   https://republicwealthmanagement.com/brokerage-services-local-equity/   (fees)
//   https://republicwealthmanagement.com/wp-content/uploads/2021/08/Brokerage-FAQs.pdf
//   https://www.stockex.co.tt/market-quote/
//   https://www.stockex.co.tt/listed-securities/
//
//   node brokers/republicwealth/republicwealth_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ttseBook } from "./ttseBook.mjs";
import fs from "node:fs";

const rows = await ttseBook();
fs.writeFileSync(new URL("republicwealth-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const tally = (key) => Object.fromEntries([...rows.reduce((map, row) => map.set(row[key], (map.get(row[key]) ?? 0) + 1), new Map())]);
console.error(`republicwealth: ${rows.length} rows`, tally("type"), tally("currency"));
