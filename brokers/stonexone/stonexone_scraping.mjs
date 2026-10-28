// What StoneX One (StoneX Securities Inc., introduced to and custodied at
// StoneX Financial Inc.) sells in shares and exchange-traded products, with
// no login. StoneX's self-directed services page names the kinds, not a
// list: "StoneX One offers investors commission-free trading for equities,
// options, mutual funds, and ETFs" and "Seamlessly trade stocks, options,
// ETFs and more from a single streamlined desktop or mobile app". Its
// disclosures say only "Not all products are available" and "Accounts
// opened through StoneX One are currently available to U.S. persons only"
// (a client condition, a remark). No page names a board, a segment or a
// kind of listed share or fund it does not sell, and none mentions OTC
// trading, so the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): every share, ADR, REIT, partnership unit,
// preferred, closed-end fund, ETF and ETN listed on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt.
//
//   https://www.stonex.com/en-us/business/self-directed-services/
//   https://www.stonex.com/en-us/business/self-directed-services/self-directed-accounts/
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations).
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees: "Commission-free online trading ... in equities, options, and
// mutual funds", footnote "Commission-free trading refers to equity, equity
// option, and mutual fund trades placed using the StoneX One platform.
// Exchange, regulatory, and other charges may apply" (self-directed
// services page). The full schedule it points to,
// https://www.stonexone.com/pricing, answered 404 on 2026-10-25. The
// stonex.com pages sit behind a Cloudflare challenge, so this script does
// not re-read them.
//
//   node brokers/stonexone/stonexone_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("stonexone-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
