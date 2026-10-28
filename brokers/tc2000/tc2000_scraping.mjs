// What TC2000 Brokerage (TC2000 Brokerage, Inc., an introducing broker
// cleared by Interactive Brokers, orders sent through IB SmartRouting)
// sells in shares and exchange-traded products, with no login. Its Form
// CRS says: "You may buy and sell equities, ETF's, options and mutual
// funds" and "We do not offer all types of securities, but limit
// investment choices to exchange traded products and mutual funds". The
// commission page prices "Stocks & ETF's" ($1 + $0.005 a share on the
// default Small Trader Plan, $5 + $0.001 on the Active Trader Plan). No
// page names a list of securities, a board, a segment or a kind of listed
// share it does not take, so the book is the whole US exchange book of the
// day, read by ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds,
// closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE
// Arca, Cboe BZX and the Texas Stock Exchange; warrants, rights, units,
// when-issued lines, listed notes and halted lines are left out there).
// The US is one NBBO market: one row per title on its primary listing, in
// dollars.
//
// Left out: OTC Markets lines, since the Form CRS limits the choice to
// "exchange traded products" (the trading disclosures carry a penny stock
// risk disclosure, but no page offers over-the-counter trading); bonds
// (withoutObligations); mutual funds, which are not exchange-listed.
//
// Not a removal, a remark: "TC2000 Brokerage can only accept applicants who
// reside in the United States or reside in a place subject to the
// jurisdiction of the United States."
//
//   https://www.tc2000.com/brokerage/commissions   (fees)
//   https://www.tc2000.com/brokerage/formcrs
//
//   node brokers/tc2000/tc2000_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FEES = "https://www.tc2000.com/brokerage/commissions";
const CRS = "https://www.tc2000.com/brokerage/formcrs";

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;|&#x27;|&rsquo;|’/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(FEES, [/Stocks & ETF's \$1 \+ \$0\.005 per share/i, /Stocks & ETF's \$5 \+ \$0\.001 per share/i]);
await new Promise((resolve) => setTimeout(resolve, 1000));
await evidence(CRS, [
  /You may buy and sell equities, ETF's, options and mutual funds/i,
  /limit investment choices to exchange traded products and mutual funds/i,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("tc2000-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
