// What Chime Invest (Chime Financial; the brokerage accounts are held at
// Atomic Brokerage LLC, a FINRA/SIPC broker-dealer) sells in shares and
// exchange-traded products. The invest page's FAQ says Chime Invest
// "currently supports stocks and ETFs only": "You can choose from 500+
// stocks including Apple, Amazon, Nike, and Tesla" and "a curated
// selection of ETFs across tech, international markets, bonds, gold, and
// more" (the page also says "500+ popular stocks and ETFs can be traded
// right in the Chime app"). Crypto, options and mutual funds are not
// offered directly.
//
//   https://www.chime.com/invest/
//
// The 500+ selection is not published: the list is in the app only, and
// chime.com answers scripts with a Cloudflare block, so this scraper
// cannot re-read the page either. With no list to filter on, and no page
// naming a board, segment or kind of listed share left out, the catalogue
// starts from the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, more than twenty times the count Chime
// gives.
//
// Size of the offer, owner rule 2026-10-25: the N most popular. The one
// count Chime gives for the whole offer is
//   "500+ popular stocks and ETFs can be traded right in the Chime app."
//     https://www.chime.com/invest/   (read 2026-10-25)
// The FAQ's "500+ stocks" comes with "a curated selection of ETFs", which
// has no number, so the offer is not split by kind: N = 500 over shares,
// ETFs and ETNs together, the 500 lines with the highest 30-day average
// daily traded value in dollars, ranked by ../wellstrade/usPopular.mjs
// (topN). Which 500 the app really holds is not public; these are the
// most traded.
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the page names
// none. The US is one NBBO market: one row per title, on its primary
// listing, in dollars.
//
// Remark, not a removal: Chime Invest is for Chime members (US residents
// with a Chime checking account).
//
// Fees: "Trading stocks and ETFs is commission-free; other fees and
// expenses may apply" (invest page, disclosure 1); Managed Portfolios, a
// separate advisory product, charge 0.25% a year ($0 for Chime Prime,
// 0.10% for Chime Plus). Fee information:
//   https://www.chime.com/invest/
//   https://www.chime.com/policies/chime/fees-info/
//
//   node brokers/chimeus/chimeus_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const N = 500; // "500+ popular stocks and ETFs"

const book = await usBook();
const offered = withoutObligations(book);
const top = await topN(offered, N);
const chosen = new Set(top);
const rows = stampRows(offered.filter((row) => chosen.has(row)));
if (rows.length !== N) throw new Error(`${rows.length} rows, not ${N}`);
fs.writeFileSync(new URL("chimeus-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (offered.length < book.length) console.error(`${book.length - offered.length} bonds left out`);
console.error(`owner rule: the ${N} most popular of ${top.report.among} lines; #${top.report.cutoff.rank} ${top.report.cutoff.text}; first left out ${top.report.firstLeftOut}; kept with no data ${top.report.keptNoData}, by size only ${top.report.keptSizeOnly}`);
