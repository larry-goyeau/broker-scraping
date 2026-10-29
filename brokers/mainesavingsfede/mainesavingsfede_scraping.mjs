// What Maine Savings Federal Credit Union sells in shares and
// exchange-traded products through its Digital Investing, with no login.
// The platform is Eko's, inside Maine Savings digital banking
// ("Investments are offered through Eko Investments and integrated into
// Maine Savings digital banking"); the client can "go self-directed and
// pick your own assets", besides pre-built and hybrid portfolios (managed
// products, not here).
//
//   https://mainesavings.com/digital-investing/
//
// The list sits behind online banking. The Eko FAQ document the page links
// gives its size: "You have access to a wide range of investment options,
// including more than 5,000 fractionable stocks and ETFs" and "You have
// the option to trade around 5,000 fractionable stocks and ETFs". It names
// no exchange, board or kind of listed share left out.
//
//   https://mainesavings.com/wp-content/uploads/2026/03/Eko-FAQ.pdf
//
// Owner rule (stated count, top N): N = 5,000, and the catalogue keeps the
// 5,000 most popular lines of the whole US exchange book of the day, shares,
// ETFs and ETNs ranked together by 30-day average traded value (see
// ../bellbank/ekoBook.mjs for the book, the ranking and what is left out).
// No OTC line: the credit union names none. One row per title on its
// primary listing, in dollars.
//
// Remarks, not removals: members enrolled in digital banking, $10 to
// start, minimum trade $1.
//
// Fees (FAQ document, "Costs and services"): "Self-directed investing is
// commission-free. We don't charge anything per trade, or to open or
// maintain your account." (0.5% a year for hybrid and pre-made
// portfolios.)
//
//   node brokers/mainesavingsfede/mainesavingsfede_scraping.mjs

import fs from "node:fs";
import { ekoBook, readPage, readPdf, linkOf, check, describe, EKO_FAQ } from "../bellbank/ekoBook.mjs";

const PAGE = "https://mainesavings.com/digital-investing/";
const N = 5000;

const page = await readPage(PAGE);
check(PAGE, page, [
  /Investments are offered through Eko Investments and integrated into Maine Savings digital banking/i,
  /go self-directed and pick your own assets/i,
]);
const faq = linkOf(PAGE, page, /Eko-FAQ[^"]*\.pdf/i);
const faqSource = check(faq, await readPdf(faq), EKO_FAQ);

const rows = await ekoBook({ n: N });
for (const ticker of ["AAPL", "SPY", "MSFT"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("mainesavingsfede-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`page ${page.source}; FAQ ${faq} ${faqSource}`);
console.error(describe(rows));
