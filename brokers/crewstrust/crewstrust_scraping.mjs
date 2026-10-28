// What Crews Bank & Trust (Florida) sells in shares and exchange-traded
// products through Crews Invest, with no login. The page: "Crews Invest is
// offered through Eko Investments and integrated into Crews Bank & Trust
// online and mobile banking. Securities and brokerage services are offered
// by Alpaca Securities LLC". Self-directed investing: "go self-directed and
// pick your own assets", "Full control to build your own portfolio".
//
//   https://www.crews.bank/digital-investing
//
// No list of securities is published (it is inside online banking) and the
// page names no board, segment or kind of listed share left out. So the
// catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt. Other banks on Eko speak of "5,000+
// stocks, bonds, and ETFs" (Casco FCU), so this is larger than what the app
// shows.
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the page names
// none. The US is one NBBO market: one row per title, on its primary
// listing, in dollars. Pre-made and hybrid portfolios are managed products
// and are not here.
//
// Remarks, not removals (they depend on the client): "18 years old of age
// or older", "A citizen of the United States", "Crews Invest is not
// available to businesses. A customer must enroll as an individual."
//
// Fees (FAQ on the same page): "A Self-Directed Digital Investing portfolio
// is commission-free. We don't charge anything per trade, or to open or
// maintain your account." and "Additional fees, including a FINRA Trading
// Activity Fee (TAF), may be charged to your account." (0.50% a year for
// pre-made and hybrid portfolios.)
//   https://www.crews.bank/digital-investing
//
//   node brokers/crewstrust/crewstrust_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://www.crews.bank/digital-investing";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /Self-Directed Digital Investing portfolio is commission-free/i,
  /Alpaca Securities LLC/,
  /Eko Investments/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("crewstrust-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
