// What U.S. Bancorp Advisors Self-Directed Investing sells in shares and
// exchange-traded products, with no login. U.S. Bank publishes no list of
// titles. Its FAQ: "You can trade stocks, ETFs, mutual funds, and options
// directly online", and the fee footnote: "No trading fees applies to
// online equity trades, exchange traded funds (ETFs), closed-end funds and
// no-load mutual funds". No page names a board, a segment or a kind of
// listed share or fund it does not sell, so the catalogue is the whole US
// exchange book of the day (../wellstrade/usBook.mjs): every share, ADR,
// REIT, partnership unit, preferred, closed-end fund, ETF and ETN listed on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt. Accounts are carried
// by National Financial Services (Fidelity).
//
//   https://www.usbank.com/investing/online-investing/self-directed-investing.html
//   https://www.usbank.com/investing/online-investing/self-directed-investing/fees.html
//
// A client restriction, not a title one (a remark, nothing removed):
// "Self-directed investing is only available to current clients of U.S.
// Bancorp Advisors and its affiliate U.S. Bank."
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: no U.S. Bank page
// says the self-directed account trades them; "Foreign securities $75 per
// transaction" on the fee page is a charge on foreign lines, which are not
// this place.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees ($0 online equities, ETFs and closed-end funds; options $4.95 +
// $1.00 a contract; $25 more through the Client Service Center):
//   https://www.usbank.com/investing/online-investing/self-directed-investing/fees.html
//
//   node brokers/usbancorpadvisor/usbancorpadvisor_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const rows = await usBook();
const kept = stampRows(withoutObligations(rows));
if (kept.length < 10000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL("usbancorpadvisor-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(rows.report.directories)}; halts: ${rows.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
