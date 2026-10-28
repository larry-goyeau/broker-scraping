// What WellsTrade (Wells Fargo Advisors' online brokerage, Wells Fargo
// Clearing Services) sells in shares and exchange-traded products, with no
// login. Its pages name the kinds, not a list: "Trade stocks, ETFs,
// options, no-load mutual funds, money markets, and more" and "$0 per
// online stock and ETF trade" (wellsfargo.com), and among the investment
// products "U.S. stocks and options" and "Exchange-traded funds"
// (wellsfargoadvisors.com). No page names a board, a segment or a kind of
// listed share or fund it does not sell, so the catalogue is the whole US
// exchange book of the day (../wellstrade/usBook.mjs): every share, ADR,
// REIT, partnership unit, preferred, closed-end fund, ETF and ETN listed on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt.
//
//   https://www.wellsfargo.com/investing/wellstrade-online-brokerage/
//   https://www.wellsfargoadvisors.com/services/online/benefits.htm
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: WellsTrade's own
// pages say "U.S. stocks" and never mention over-the-counter trading (only
// a third-party review says it takes OTC orders above $1), so the book
// stays the exchange-listed one.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees ($0 online stocks and ETFs, $25 agent-assisted):
//   https://www.wellsfargoadvisors.com/services/online/fees-expanded.htm
//
//   node brokers/wellstrade/wellstrade_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "./usBook.mjs";

const rows = await usBook();
const kept = stampRows(withoutObligations(rows));
if (kept.length < 10000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL("wellstrade-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(rows.report.directories)}; halts: ${rows.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
