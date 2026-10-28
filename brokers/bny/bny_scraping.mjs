// What the BNY Brokerage Account (BNY Brokerage Services, a division of BNY
// Mellon Securities Corporation; introduced to and cleared by Pershing LLC)
// sells in shares and exchange-traded products, with no login. The account
// page lists "exchange-traded funds (ETFs), individual stocks and bonds,
// options" among its investment choices; the brochure says "Stocks,
// exchange-traded funds, bonds ... as well as equity and index options",
// and the Form CRS "mutual funds, exchange traded funds (ETFs), stocks and
// bonds". No page names a board, a segment or a kind of listed share or
// fund left out, so the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt.
//
//   https://www.bny.com/investments/us/en/individual/resources/investment-tools-services/bny-brokerage-account.html
//   https://www.bny.com/content/dam/im/documents/manual/brochures/bny-mellon-brokerage-account.pdf
//   https://www.bny.com/content/dam/im/documents/manual/account-forms/5dccrs.pdf
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines and foreign shares are not added:
// no page names them. The US is one NBBO market: one row per title, on its
// primary listing, in dollars.
//
// Remark, not a removal: the brochure gives a $10,000 minimum for the basic
// account ("No minimums for IRA accounts").
//
// Fees: the account page says "$8.95 per trade for the first 1,000 shares
// and $0.01 per share thereafter" (the February 2026 brochure says $2.00);
// the full Fee and Commission Schedule is given at enrolment:
//   https://www.bny.com/investments/us/en/individual/resources/investment-tools-services/bny-brokerage-account.html
//
//   node brokers/bny/bny_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://www.bny.com/investments/us/en/individual/resources/investment-tools-services/bny-brokerage-account.html";

// The account page still says what the header quotes, or the run stops.
const response = await fetch(PAGE, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`${response.status} ${PAGE}`);
const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|\s+/g, " ");
for (const pattern of [/exchange-traded funds \(ETFs\), individual stocks/i, /\$[\d.]+ per trade for the first 1,000 shares/i]) {
  if (!pattern.test(text)) throw new Error(`${PAGE} no longer says ${pattern}`);
}

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("bny-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
