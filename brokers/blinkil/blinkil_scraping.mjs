// What Blink (heyblink.com, an Israeli stock exchange member app) sells on
// the US market, with no login. Its FAQ says: "אפשר להשקיע במניות וקרנות סל
// (ETF) הנסחרות בארה״ב" (you can invest in shares and ETFs traded in the
// US), "בבלינק תמצאו קרוב ל-10,000 מניות וקרנות סל" (close to 10,000 shares
// and ETFs), and "אנחנו לא מאפשרים מסחר במניות הנסחרות בבורסה OTC" (no
// trading in OTC shares, except a holding that moved to OTC). The app's
// list itself is not public and no page names a board, a segment or a
// kind of listed share or fund left out, so the catalogue is the whole US
// exchange book of the day (../wellstrade/usBook.mjs): shares, ADRs,
// REITs, partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt.
//
//   https://heyblink.com/support-category/investments/
//
// Owner rule 2026-10-25: the N most popular. The FAQ gives the size of the
// US offer, "בבלינק תמצאו קרוב ל-10,000 מניות וקרנות סל" (close to 10,000
// shares and ETFs), one count for shares and ETFs together, so N = 10,000
// across the book's shares, ETFs and ETNs (all exchange-traded): the
// 10,000 lines with the highest 30-day average traded value in dollars
// (../wellstrade/usPopular.mjs), of about 12,200.
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added (quote above). The
// US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Not in this catalogue, as broker-list.json gives Blink the United States
// only: the same FAQ offers a pilot of Irish-domiciled ETFs "נסחרות בבורסה
// האנגלית בדולרים" (traded on the London exchange in dollars, market orders
// only, 16:30-18:30 Israel time), and Tel Aviv mutual funds. The tariff
// also prices a line for securities abroad outside the US.
//
// Remarks, not removals: no pre-market or after-hours trading ("אנחנו לא
// תומכים בשלב זה במסחר פרי-מרקט ואפטר-מרקט"); most, not all, titles can be
// bought in fractions.
//
// Fees: up to 10 trades or 1,000 shares a month free, then "$0.01 למניה"
// (per share or fraction), minimum $1.5, maximum 1.8% of the trade; the
// full tariff PDF prices "ניירות ערך בחוץ לארץ – רק ארה"ב" the same way:
//   https://heyblink.com/pricing/
//   https://heyblink.com/wp-content/uploads/2026/09/blink-trading-fees-070926.pdf
//
//   node brokers/blinkil/blinkil_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://heyblink.com/pricing/", [/\$0\.01 למניה/, /מינימום \$1\.5 לפעולה/]);
await pause();
await evidence("https://heyblink.com/support-category/investments/", [
  /אפשר להשקיע במניות וקרנות סל \(ETF\) הנסחרות בארה.ב/,
  /אנחנו לא מאפשרים מסחר במניות הנסחרות בבורסה OTC/,
  /בבלינק תמצאו קרוב ל-10,000 מניות וקרנות סל/,
]);

const N = 10000;
const book = await usBook();
const all = withoutObligations(book);
if (all.length < N) throw new Error(`only ${all.length} lines in the book`);
const top = await topN(all, N);
const kept = new Set(top);
const rows = stampRows(all.filter((row) => kept.has(row)));
if (rows.length !== N) throw new Error(`${rows.length} rows, not ${N}`);
fs.writeFileSync(new URL("blinkil-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
console.error(`top ${N} of ${all.length} lines; #${N}: ${top.report.cutoff.text}; first left out: ${top.report.firstLeftOut}; kept with no data ${top.report.keptNoData}, by size only ${top.report.keptSizeOnly}`);
