// What Union Bank (Morrisville, Vermont) sells in shares and
// exchange-traded products through its investment app (SimpleInvestment),
// with no login. The app is Eko's, inside Union Bank online and mobile
// banking (funding "will indicate Alpaca Securities in the ACH
// transaction"): a portfolio built from the client's answers, which the
// client can "Customize ... with individual securities", and
// self-directed portfolios ("For Self-Directed portfolios, trades are
// entered as market orders at the time you place the order in the Eko
// investment app").
//
//   https://www.ublocal.com/online-banking/simpleinvestment/
//
// The list sits behind online banking, and the page gives no number of
// lines and names no board, segment or kind of listed share left out. So
// the catalogue is the whole US exchange book of the day, as for the other
// Eko banks that give no figure (see ../bellbank/ekoBook.mjs for the book
// and what is left out). No OTC line: the bank names none. One row per
// title on its primary listing, in dollars.
//
// Remarks, not removals: a Union Bank checking or savings account and
// online or mobile banking; $10 to start; market orders only.
//
// Fees (FAQ on the page): "What does it cost? A small fee, as a percentage
// of your assets (0.50%), will be automatically deducted from customers'
// portfolio every month. For example, a $10,000 investment portfolio will
// be charged $4.17 per month." No per-trade charge is named.
//
//   node brokers/unionbankvermont/unionbankvermont_scraping.mjs

import fs from "node:fs";
import { ekoBook, readPage, check, describe } from "../bellbank/ekoBook.mjs";

const PAGE = "https://www.ublocal.com/online-banking/simpleinvestment/";

const page = await readPage(PAGE);
check(PAGE, page, [
  /Customize your portfolio with individual securities/i,
  /For Self-Directed portfolios, trades are entered as market orders/i,
  /A small fee, as a percentage of your assets \(0\.50%\), will be automatically deducted/i,
  /Alpaca Securities/i,
]);

const rows = await ekoBook();
for (const ticker of ["AAPL", "UNB", "SPY"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("unionbankvermont-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`page ${page.source}`);
console.error(describe(rows));
