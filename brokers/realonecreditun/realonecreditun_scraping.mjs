// What Real One Credit Union (R1, Colorado) sells in shares and
// exchange-traded products through Eko, with no login. "Real One has
// partnered with Eko to offer you a seamless and intuitive digital
// investment experience directly within your online banking", from guided
// investing "to fully self-directed investing". Guided (pre-built, hybrid)
// portfolios are managed products and are not here.
//
//   https://www.myreal1.com/eko
//
// The list sits behind online banking. The Eko FAQ document the page links
// gives its size: "You have access to a wide range of investment options,
// including more than 5,000 fractionable stocks and ETFs" and "You have
// the option to trade around 5,000 fractionable stocks and ETFs". It names
// no exchange, board or kind of listed share left out. (broker-list.json
// says 6,000; the credit union's own document says 5,000.)
//
//   https://www.myreal1.com/s/Eko-FAQ-Document.pdf
//
// Owner rule (stated count, top N): N = 5,000, and the catalogue keeps the
// 5,000 most popular lines of the whole US exchange book of the day, shares,
// ETFs and ETNs ranked together by 30-day average traded value (see
// ../bellbank/ekoBook.mjs for the book, the ranking and what is left out).
// No OTC line: the credit union names none. One row per title on its
// primary listing, in dollars.
//
// Remarks, not removals: members with online banking, $10 to start,
// minimum trade $1.
//
// Fees: "enjoy commission-free trading on self-directed accounts" (page);
// "Self-directed investing is commission-free. We don't charge anything per
// trade, or to open or maintain your account." (FAQ document).
//
//   node brokers/realonecreditun/realonecreditun_scraping.mjs

import fs from "node:fs";
import { ekoBook, readPage, readPdf, linkOf, check, describe, EKO_FAQ } from "../bellbank/ekoBook.mjs";

const PAGE = "https://www.myreal1.com/eko";
const N = 5000;

const page = await readPage(PAGE);
check(PAGE, page, [
  /Real One has partnered with Eko/i,
  /fully self-directed investing/i,
  /commission-free trading on self-directed accounts/i,
]);
const faq = linkOf(PAGE, page, /Eko-FAQ[^"]*\.pdf/i);
const faqSource = check(faq, await readPdf(faq), EKO_FAQ);

const rows = await ekoBook({ n: N });
for (const ticker of ["AAPL", "SPY", "MSFT"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("realonecreditun-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`page ${page.source}; FAQ ${faq} ${faqSource}`);
console.error(describe(rows));
