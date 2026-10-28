// What Central National Bank (Kansas) sells in shares and exchange-traded
// products, with no login. Its Digital Investing sits inside online and
// mobile banking and is run by Eko Investments, Inc. (SEC registered
// investment adviser), with "Brokerage services ... provided to clients by
// Alpaca Securities LLC". The self-directed portfolio lets the client
// "Build your own portfolio by selecting from over 6,000 stocks, bonds, and
// Exchange Traded Funds (ETFs)", "including fractional shares". Eko's
// Investment Management Agreement adds that in a self-directed
// (non-discretionary) portfolio "you may only select Securities from a
// limited universe of available Securities determined by Eko".
//
//   https://centralnational.com/whycentral/digital-investing.asp
//   https://eko.investments/legal/InvestmentManagementAgreement.pdf
//
// Neither page publishes that universe or names a board, segment or kind of
// listed share it leaves out; the list is only visible inside online
// banking. So the book is the whole US exchange book of the day, read by
// ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas Stock Exchange; warrants, rights, units, when-issued lines,
// listed notes and halted lines are left out there), as for the other bank
// portals whose selection is not public; about 12,000 lines.
//
// Owner rule 2026-10-25: the N most popular. The page gives the size of
// the offer on this place, "Build your own portfolio by selecting from
// over 6,000 stocks, bonds, and Exchange Traded Funds (ETFs)" (one figure
// for all kinds; the bonds in it are not in this catalogue, so the shares
// and ETFs are at most that many), so N = 6,000 and the catalogue keeps
// the 6,000 most popular lines of the book, shares, ETFs and ETNs ranked
// together by 30-day average traded value in dollars
// (../wellstrade/usPopular.mjs).
//   https://centralnational.com/whycentral/digital-investing.asp
//
// Bonds (withoutObligations) are out. The US is one NBBO
// market: one row per title on its primary listing, in dollars. OTC
// Markets lines are not named and are not in the book.
//
// Remarks, not removals: for Central National Bank customers enrolled in
// online banking; "Must be 18 years old or older to invest. Must enroll as
// an individual. Digital Investing is not available to non-person
// entities."
//
// Fees (same page): "Self-Directed Investing is commission-free. We don't
// charge anything per trade, or to open and maintain your account."
// Pre-built and hybrid portfolios pay a 0.50% yearly management fee.
//
//   https://centralnational.com/whycentral/digital-investing.asp
//
//   node brokers/centralnational/centralnational_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://centralnational.com/whycentral/digital-investing.asp";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /Self-Directed Investing is commission-free/i,
  /charge anything per trade/i,
  /selecting from over 6,000 stocks, bonds, and Exchange Traded Funds/i,
  /Alpaca Securities/,
]);

const N = 6000;
const book = await usBook();
const all = stampRows(withoutObligations(book));
if (all.length < 10000) throw new Error(`only ${all.length} rows in the book`);
const rows = await topN(all, N);
if (rows.length !== N) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("centralnational-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const { report } = rows;
console.error(`kept the ${N} most popular of ${report.among} lines; #${N}: ${report.cutoff.text}; first left out: ${report.firstLeftOut}`);

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
