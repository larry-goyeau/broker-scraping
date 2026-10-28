// What Casco Federal Credit Union (Maine) sells in shares and
// exchange-traded products through CascoINVEST, with no login. CascoINVEST
// sits in online and mobile banking and is run by Eko Investments (the FAQ
// sends questions to hello@eko.investments; Eko's site says "Brokerage
// services are provided to clients by Alpaca Securities LLC"). The page
// offers "self-directed investing with commission-free trading on 5,000+
// stocks, bonds, and ETFs".
//
//   https://www.cascofcu.com/additional-services/cascoinvest
//   https://eko.investments/legal
//
// The 5,000+ lines are not published (the platform sits behind online
// banking) and the page names no board, segment or kind of listed share
// left out. The book they are taken from is the whole US exchange book of
// the day (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership
// units, preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt (about 12,000 lines).
//
// Owner rule 2026-10-25: the N most popular. The page gives the size of
// the offer on this place, "commission-free trading on 5,000+ stocks,
// bonds, and ETFs" (one figure for all kinds; the bonds in it are not in
// this catalogue, so the shares and ETFs are at most that many), so
// N = 5,000 and the catalogue keeps the 5,000 most popular lines of the
// book, shares, ETFs and ETNs ranked together by 30-day average traded
// value in dollars (../wellstrade/usPopular.mjs).
//   https://www.cascofcu.com/additional-services/cascoinvest
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the page names
// none. The US is one NBBO market: one row per title, on its primary
// listing, in dollars. Hybrid and pre-built portfolios are managed products
// and are not here.
//
// Remarks, not removals (they depend on the client): "Must be 18 years old
// or older to invest. Must enroll as an individual. CascoINVEST is not
// available to non-person entities."; members enrolled in online banking.
//
// Fees (FAQ on the same page): "A Self-Directed CascoINVEST portfolio is
// commission-free. We don't charge anything per trade, or to open or
// maintain your account." (0.5% a year for hybrid and pre-built portfolios.)
//   https://www.cascofcu.com/additional-services/cascoinvest#CascoINVEST_FAQ
//
//   node brokers/cascofederalcred/cascofederalcred_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://www.cascofcu.com/additional-services/cascoinvest";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /commission-free trading on 5,000\+ stocks, bonds, and ETFs/i,
  /Self-Directed CascoINVEST portfolio is commission-free/i,
  /eko\.investments/i,
]);

const N = 5000;
const book = await usBook();
const all = stampRows(withoutObligations(book));
if (all.length < 10000) throw new Error(`only ${all.length} rows in the book`);
const rows = await topN(all, N);
if (rows.length !== N) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("cascofederalcred-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const { report } = rows;
console.error(`kept the ${N} most popular of ${report.among} lines; #${N}: ${report.cutoff.text}; first left out: ${report.firstLeftOut}`);

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
