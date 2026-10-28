// What Citi Self Invest (Citigroup Global Markets, Citi Personal Wealth
// Management) sells in shares and exchange-traded products, with no login.
// Citi publishes no list of titles. Its fee schedule prices "Listed and
// NMS/Over the Counter stocks, rights and warrants", with a Citi Self
// Invest column of $0 for "ETFs — Online/Mobile" and "Equities —
// Online/Mobile"; Citi's launch release calls it "no-cost self-directed
// investments in equities and ETFs". No Citi page names a board, a segment
// or a kind of listed share or fund it does not sell, so the catalogue is
// the whole US exchange book of the day (../wellstrade/usBook.mjs): every
// share, ADR, REIT, partnership unit, preferred, closed-end fund, ETF and
// ETN listed on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the
// Texas Stock Exchange, less the lines with an open trade halt.
//
//   https://www.citi.com/investorinfo/assets/docs/CPWM-Annual-Account-Fees.pdf
//   https://www.citigroup.com/global/news/press-release/2021/citi-introduces-citi-self-invest
//
// Kept although the fee schedule singles them out: leveraged and inverse
// ETFs. Footnote 1 says "Commission-free trading of ETFs excludes leveraged
// and inverse ETFs": that is a price, for the cost file, not a title Citi
// refuses to sell.
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the schedule's
// "Over the Counter" wording is the shared CPWM tariff for all account
// types, and no Self Invest page says the app trades OTC Markets lines.
// Foreign shares on foreign exchanges are not Self Invest: the schedule
// sends "foreign security pricing" to a Registered Representative, and
// Self Invest has no representative pricing.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees ($0 online stocks and ETFs; options $0 + $0.65 a contract):
//   https://www.citi.com/investorinfo/assets/docs/CPWM-Annual-Account-Fees.pdf
//
//   node brokers/citiself/citiself_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const rows = await usBook();
const kept = stampRows(withoutObligations(rows));
if (kept.length < 10000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL("citiself-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(rows.report.directories)}; halts: ${rows.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
