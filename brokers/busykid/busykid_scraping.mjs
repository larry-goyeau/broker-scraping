// What BusyKid (Apex Clearing as custodian) sells in shares and
// exchange-traded funds. BusyKid publishes no list of titles: its offer is
// "hundreds of the most popular stocks or ETFs", chosen in the app's
// Save/Invest screen, whose list (v3.busykid.com/money/stocks) needs a
// signed-in session. It charges "$0 commissions to purchase or sell stocks"
// (with its subscription) and names no exchange and no excluded segment.
//
//   https://busykid.com/investing-for-kids/
//
// The owner's rule for a broker with a single place and no published list
// (2026-10-25): take the whole place. So the catalogue is the whole US
// exchange book of the day (../wellstrade/usBook.mjs: every share, ADR,
// REIT, partnership unit, preferred, closed-end fund, ETF and ETN listed on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt). Warrants, rights,
// units, when-issued lines and listed notes (usBook) and bonds
// (withoutObligations) are left out as in the other US catalogues; OTC
// Markets lines are not added, as no BusyKid page names them. This
// overstates BusyKid's curated range ("hundreds"); it is the owner's
// choice while no list is published.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
//   node brokers/busykid/busykid_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const FOLDER = "busykid";
const rows = await usBook();
const kept = stampRows(withoutObligations(rows));
if (kept.length < 10000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);

