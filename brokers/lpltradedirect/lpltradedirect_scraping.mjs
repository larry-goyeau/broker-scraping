// What LPL Trade Direct (Client Trade Direct, LPL Financial LLC, member
// FINRA/SIPC) sells in shares and exchange-traded products. LPL publishes
// no list of titles. Its fee schedule for the self-directed accounts prices
// "Equities, ETFs and Options — Orders entered electronically (internet)
// $14.95 + Confirm Fee" ($5 per transaction) and charges foreign
// securities separately ("Transaction (not applicable to American
// Depository Receipts) $40"); it names no exchange and no excluded US
// segment. lpl.com answers plain HTTP clients with a Cloudflare 403, so the
// schedule was read in a browser on 2026-10-25:
//
//   https://www.lpl.com/content/dam/edam/practice-management/fees/fs07-ctd.pdf
//     ("FS07-CTD Revised 0926")
//
// The owner's rule for a broker with a single place and no published list
// (2026-10-25): take the whole place. So the catalogue is the whole US
// exchange book of the day (../wellstrade/usBook.mjs: every share, ADR,
// REIT, partnership unit, preferred, closed-end fund, ETF and ETN listed on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt). Warrants, rights,
// units, when-issued lines and listed notes (usBook) and bonds
// (withoutObligations) are left out as in the other US catalogues; OTC
// Markets lines are not added, as the schedule does not name them.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
//   node brokers/lpltradedirect/lpltradedirect_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const rows = await usBook();
const kept = stampRows(withoutObligations(rows));
if (kept.length < 10000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL("lpltradedirect-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
