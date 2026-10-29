// What Memphis City Employees Credit Union (MCECU, Tennessee) sells in
// shares and exchange-traded products through MCECU Investments, with no
// login. The platform is Eko's, in MCECU digital banking ("Investments are
// offered through Eko Investments, Inc."): "choose from a guided, a
// self-directed, or hybrid portfolio", and "Can I choose my own
// investments? Of course! You can choose a self-directed portfolio".
// Guided and hybrid portfolios are managed products and are not here.
//
//   https://www.memphiscu.org/investments
//
// (broker-list.json gives www.mcecu.org, which is Marathon County Employees
// Credit Union in Wisconsin; Memphis City Employees CU is memphiscu.org.)
//
// The list sits behind online banking, and the page gives no number of
// lines (broker-list.json's 6,000 is not on the credit union's pages) and
// names no board, segment or kind of listed share left out. So the
// catalogue is the whole US exchange book of the day, as for the other Eko
// banks that give no figure (see ../bellbank/ekoBook.mjs for the book and
// what is left out). No OTC line: the credit union names none. One row per
// title on its primary listing, in dollars.
//
// Remarks, not removals: members with MCECU digital banking, $10 to start.
//
// Fees (FAQ on the page): "A Self-Directed investing portfolio is
// commission-free. We don't charge anything per trade, or to open or
// maintain your account." (0.50% a year for hybrid and pre-built
// portfolios.)
//
//   node brokers/memphiscityemplo/memphiscityemplo_scraping.mjs

import fs from "node:fs";
import { ekoBook, readPage, check, describe } from "../bellbank/ekoBook.mjs";

const PAGE = "https://www.memphiscu.org/investments";

const page = await readPage(PAGE);
check(PAGE, page, [
  /Memphis City Employees Credit Union/i,
  /You can choose a self-directed portfolio/i,
  /A Self-Directed investing portfolio is commission-free\. We don't charge anything per trade/i,
  /Investments are offered through Eko Investments, Inc\./i,
]);

const rows = await ekoBook();
for (const ticker of ["AAPL", "BRK.B", "SPY"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("memphiscityemplo-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`page ${page.source}`);
console.error(describe(rows));
