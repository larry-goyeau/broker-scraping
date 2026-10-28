// What Educators Credit Union (Wisconsin) sells in shares and
// exchange-traded products, with no login. "Online Stock Trading" sits in
// its online and mobile banking and is run by Eko Investments (the FAQ sends
// transfer questions to hello@eko.investments; Eko's site says "Brokerage
// services are provided to clients by Alpaca Securities LLC"). The page
// says: "trade stocks or ETFs with ease", and for self-directed portfolios
// "go self-directed and pick your own assets ... from buying fractional
// shares and ETFs".
//
//   https://www.ecu.com/digital-services/online-stock-trading/
//   https://eko.investments/legal
//
// No list of securities is published (it is inside online banking) and the
// pages name no board, segment or kind of listed share left out. So the
// catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt. Other credit unions on Eko speak of
// "5,000+ stocks, bonds, and ETFs" (Casco FCU), so this is larger than what
// the app shows.
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the page names
// none. The US is one NBBO market: one row per title, on its primary
// listing, in dollars. Hybrid and pre-built portfolios are managed products
// and are not here.
//
// Remarks, not removals (they depend on the client): "Must be at least 18
// years old to use this service"; "Business and Fiduciary Accounts, such as
// Custodial, Trust, Rep-payee and Guardianships are not eligible"; trading
// hours "8:30 a.m. to 3:00 p.m. Central Time"; membership by county in
// Wisconsin and Illinois.
//
// Fees (same page): "Self-directed investing is commission-free. We don't
// charge anything per trade or to maintain your account." and "No fee
// transactions for self-directed investing."
//   https://www.ecu.com/digital-services/online-stock-trading/
//
//   node brokers/educatorscreditu/educatorscreditu_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://www.ecu.com/digital-services/online-stock-trading/";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ").replace(/&#8217;|&rsquo;/g, "’");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /Self-directed investing is commission-free/i,
  /charge anything per trade/i,
  /trade stocks or ETFs/i,
  /eko\.investments/i,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("educatorscreditu-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
