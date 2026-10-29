// What Peoples Bank (Iowa) sells in shares and exchange-traded products
// through its Digital Investing, with no login. "Digital Investing Made
// Simple Offered by Eko Investments Inc.", inside Peoples Bank Online &
// Mobile Banking; the client can "go self-directed and pick your own
// assets", besides pre-built and hybrid portfolios (managed products, not
// here).
//
//   https://www.peoples-ebank.com/digital-banking/digital-investing
//
// The list sits behind online banking. The Eko FAQ document the page links
// as "Full FAQ Page" gives its size: "You have access to a wide range of
// investment options, including more than 5,000 fractionable stocks and
// ETFs" and "You have the option to trade around 5,000 fractionable stocks
// and ETFs". It names no exchange, board or kind of listed share left out.
//
//   https://www.peoples-ebank.com/assets/files/jypCdRnC   (PDF)
//
// Owner rule (stated count, top N): N = 5,000, and the catalogue keeps the
// 5,000 most popular lines of the whole US exchange book of the day, shares,
// ETFs and ETNs ranked together by 30-day average traded value (see
// ../bellbank/ekoBook.mjs for the book, the ranking and what is left out).
// No OTC line: the bank names none. One row per title on its primary
// listing, in dollars.
//
// Remarks, not removals: $10 to start, minimum trade $1.
//
// Fees (FAQ document, "Costs and services"): "Self-directed investing is
// commission-free. We don't charge anything per trade, or to open or
// maintain your account." (0.5% a year for hybrid and pre-made portfolios.)
//
//   node brokers/peoplesbankiowa/peoplesbankiowa_scraping.mjs

import fs from "node:fs";
import { ekoBook, readPage, readPdf, linkOf, check, describe, EKO_FAQ } from "../bellbank/ekoBook.mjs";

const PAGE = "https://www.peoples-ebank.com/digital-banking/digital-investing";
const N = 5000;

const page = await readPage(PAGE);
check(PAGE, page, [
  /Digital Investing Made Simple Offered by Eko Investments Inc\./i,
  /go self-directed and pick your own assets/i,
]);
const faq = linkOf(PAGE, page, /^Full FAQ Page$/i);
const faqSource = check(faq, await readPdf(faq), EKO_FAQ);

const rows = await ekoBook({ n: N });
for (const ticker of ["AAPL", "SPY", "MSFT"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("peoplesbankiowa-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`page ${page.source}; FAQ ${faq} ${faqSource}`);
console.error(describe(rows));
