// What Extraco Banks (Texas) sells in shares and exchange-traded products
// through EasyInvest, its digital investing platform inside the Extraco
// eBank app and online banking, with no login. The EasyInvest page:
// "get started investing in stocks, bonds, and ETFs free of charge with as
// little as $10", and its FAQ: "You can invest in over 5,000 stocks and
// ETFs, including fractional shares".
//
//   https://www.extracobanks.com/digital-banking/online-banking/easyinvest-extraco
//   https://www.extracobanks.com/resources/faq/what-types-investments-can-i-make-easyinvest
//
// The 5,000 lines are not published (the platform sits behind eBank) and
// no page names a board, segment or kind of listed share left out. The
// book they are taken from is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt (about 12,000 lines).
//
// Owner rule 2026-10-25: the N most popular. The FAQ gives the size of
// the offer on this place, "over 5,000 stocks and ETFs" (one figure for
// both kinds), so N = 5,000 and the catalogue keeps the 5,000 most popular
// lines of the book, shares, ETFs and ETNs ranked together by 30-day
// average traded value in dollars (../wellstrade/usPopular.mjs).
//   https://www.extracobanks.com/resources/faq/what-types-investments-can-i-make-easyinvest
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). Cryptocurrency, also named on the page, is another
// product. OTC Markets lines are not added: no page names them. The US is
// one NBBO market: one row per title, on its primary listing, in dollars.
//
// Fees: the page's "free of charge" is the only tariff; it names no
// commission, platform or account fee. The broker-dealer is not named.
//   https://www.extracobanks.com/digital-banking/online-banking/easyinvest-extraco
//
//   node brokers/extracobanks/extracobanks_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://www.extracobanks.com/digital-banking/online-banking/easyinvest-extraco";
const FAQ = "https://www.extracobanks.com/resources/faq/what-types-investments-can-i-make-easyinvest";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [/stocks, bonds, and ETFs free of charge/i]);
await new Promise((resolve) => setTimeout(resolve, 1000));
await evidence(FAQ, [/over 5,000 stocks and ETFs/i]);

const N = 5000;
const book = await usBook();
const all = stampRows(withoutObligations(book));
if (all.length < 10000) throw new Error(`only ${all.length} rows in the book`);
const rows = await topN(all, N);
if (rows.length !== N) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("extracobanks-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const { report } = rows;
console.error(`kept the ${N} most popular of ${report.among} lines; #${N}: ${report.cutoff.text}; first left out: ${report.firstLeftOut}`);

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
