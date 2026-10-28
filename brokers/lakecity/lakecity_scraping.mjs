// What Lake City Bank (Indiana) sells in shares and exchange-traded
// products, with no login. Its Digital Investing sits inside Lake City Bank
// Digital and is run by Eko Investments, Inc. (SEC registered investment
// adviser), with "Brokerage services ... provided to clients by Alpaca
// Securities LLC". Of its three portfolio types, the self-directed one
// "starts with an empty portfolio that you populate by choosing stocks
// (including fractional shares), bonds and ETFs" ("Bonds are bought through
// an exchange-traded fund (ETF)"), and the FAQ says "You have access to
// trade approximately 5,000 fractional shares and ETFs". Eko's Investment
// Management Agreement adds that in a self-directed (non-discretionary)
// portfolio "you may only select Securities from a limited universe of
// available Securities determined by Eko".
//
//   https://www.lakecitybank.com/personal/digital-banking/digital-investing/
//   https://eko.investments/legal/InvestmentManagementAgreement.pdf
//
// Neither page publishes that universe or names a board, segment or kind of
// listed share it leaves out; the list is only visible inside online
// banking. So the book is the whole US exchange book of the day, read by
// ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas Stock Exchange; warrants, rights, units, when-issued lines,
// listed notes and halted lines are left out there), as for the other bank
// portals whose selection is not public. It is more than twice the
// "approximately 5,000" the page gives, so many lines are not in the app;
// nothing public says which. Bonds (withoutObligations) are out. The US is
// one NBBO market: one row per title on its primary listing, in dollars.
// OTC Markets lines are not named and are not in the book.
//
// Remarks, not removals: Lake City Bank Digital enrolment required, "Must be
// 18 years old or older to invest", minimum investment of $1 a trade.
//
// Fees (same page): self-directed "Cost to invest: No cost"; "Investing is
// commission-free. There is no charge per trade, or to open or maintain
// your account." Pre-made and hybrid portfolios pay a 0.40% yearly wrap fee.
//
//   https://www.lakecitybank.com/personal/digital-banking/digital-investing/
//
//   node brokers/lakecity/lakecity_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.lakecitybank.com/personal/digital-banking/digital-investing/";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#8209;|‑/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /Investing is commission-free/i,
  /There is no charge per trade/i,
  /approximately 5,000 fractional shares and ETFs/i,
  /Self-directed investing starts with an empty portfolio/i,
  /Alpaca Securities/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("lakecity-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
