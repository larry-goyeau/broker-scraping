// What Bell Bank (Fargo, North Dakota) sells in shares and exchange-traded
// products through Bell Digital Investing, with no login. The platform is
// Eko's, inside Bell's app and online banking ("Digital Investing Made
// Simple Offered by Eko Investments Inc."), and lets the client "go
// self-directed and pick your own assets", besides pre-built and hybrid
// portfolios (managed products, not here).
//
//   https://bell.bank/banking/digital-investing
//
// The list sits behind online banking. Bell's Eko FAQ document, linked
// from the page, gives its size: "You have access to a wide range of
// investment options, including more than 5,000 fractionable stocks and
// ETFs" and "You have the option to trade around 5,000 fractionable stocks
// and ETFs". It names no exchange, board or kind of listed share left out.
//
//   additional-eko-investments-faqs.pdf (linked as such from the page)
//
// Owner rule (stated count, top N): N = 5,000, and the catalogue keeps the
// 5,000 most popular lines of the whole US exchange book of the day, shares,
// ETFs and ETNs ranked together by 30-day average traded value (see
// ./ekoBook.mjs for the book, the ranking and what is left out). No OTC
// line: the bank names none. One row per title on its primary listing, in
// dollars.
//
// Remarks, not removals: funding minimum $10, minimum trade $1; ACAT
// transfer out "would incur a charge".
//
// Fees (FAQ document, "Costs and services"): "Self-directed investing is
// commission-free. We don't charge anything per trade, or to open or
// maintain your account." The page: "Pre-Built and Hybrid portfolios are
// subject to an annual management fee of 0.50%" (not the self-directed
// portfolio).
//
//   node brokers/bellbank/bellbank_scraping.mjs

import fs from "node:fs";
import { ekoBook, readPage, readPdf, linkOf, check, describe, EKO_FAQ } from "./ekoBook.mjs";

const PAGE = "https://bell.bank/banking/digital-investing";
const N = 5000;

const page = await readPage(PAGE);
check(PAGE, page, [
  /Digital Investing Made Simple Offered by Eko Investments Inc\./i,
  /go self-directed and pick your own assets/i,
  /Pre-Built and Hybrid portfolios are subject to an annual management fee of 0\.50%/i,
]);
const faq = linkOf(PAGE, page, /eko[^"]*faq[^"]*\.pdf/i);
const faqSource = check(faq, await readPdf(faq), EKO_FAQ);

const rows = await ekoBook({ n: N });
for (const ticker of ["AAPL", "SPY", "MSFT"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("bellbank-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`page ${page.source}; FAQ ${faqSource}`);
console.error(describe(rows));
