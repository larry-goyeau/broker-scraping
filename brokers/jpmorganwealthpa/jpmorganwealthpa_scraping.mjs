// What J.P. Morgan Wealth Partners (J.P. Morgan Securities LLC) sells
// through online trading, with no login. Online trading is an option of
// its full-service brokerage accounts, "offering unlimited commission-free
// online trades for U.S.-listed stocks, ETFs, mutual funds and J.P. Morgan
// money market funds", and the FAQ answers "What types of investments are
// available through online trading?" with "U.S.-listed stocks, ETFs,
// mutual funds and J.P. Morgan money market funds". J.P. Morgan publishes
// no list of titles and the page names no board, segment or kind of
// listed share it leaves out, so the catalogue is the whole US exchange
// book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt.
//
//   https://www.jpmorgan.com/wealth-management/wealth-partners/online-tools/how-to-pages/trade-online
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). Mutual funds and money market funds are not
// exchange-traded and are not here. OTC Markets lines are not added: the
// page says "U.S.-listed".
// Not a removal, a remark: online trading must be enabled by "your J.P.
// Morgan team"; "Online stock and ETF trades are limited to 100,000 shares
// or $3 million notional per trade"; no after-hours trading.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees ($0 online commissions; sales pay "a regulatory transaction fee of
// between $0.01 and $0.03 per $1,000 of principal"), same page:
//   https://www.jpmorgan.com/wealth-management/wealth-partners/online-tools/how-to-pages/trade-online
//
//   node brokers/jpmorganwealthpa/jpmorganwealthpa_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PAGE = "https://www.jpmorgan.com/wealth-management/wealth-partners/online-tools/how-to-pages/trade-online";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /unlimited commission-free online trades for U\.S\.-listed stocks, ETFs/i,
  /Online trading support U\.S\.-listed stocks, ETFs/i,
]);

const rows = await usBook();
const kept = stampRows(withoutObligations(rows));
if (kept.length < 10000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL("jpmorganwealthpa-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(rows.report.directories)}; halts: ${rows.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
