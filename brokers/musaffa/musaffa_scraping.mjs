// What Musaffa (Musaffa LLC, an SEC-registered internet adviser; orders
// executed and cleared by Alpaca Securities LLC) sells on its self-directed
// Halal Investing Platform, with no login. Its pricing page says "Invest in
// US listed halal stocks and ETFs, on your own terms. Simple pricing with
// no trading commissions" and "Trade 11,000+ U.S. stocks and ETFs
// commission-free"; the research pricing page says "Access 11,000+
// U.S.-listed stocks and ETFs directly through the Musaffa Halal Investing
// Platform — fully screened for Shariah compliance", against "1,339 Halal
// stocks (out of 6,403 total)" and "72 Halal ETFs (out of 3,764 total)".
// The 11,000 is the whole listed US book, so the halal rating is a screen
// shown to the client, not a list of what can be traded; no Musaffa page
// (pricing pages, Form ADV Part 2A) says a non-compliant line is refused.
// So the catalogue starts from the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, about 12,200 lines.
//
// Size of the offer, owner rule 2026-10-25: the N most popular. Musaffa
// gives one count for the US place, stocks and ETFs together:
//   "Trade 11,000+ U.S. stocks and ETFs commission-free"
//     https://musaffa.com/halal-investing-pricing/
//   "Access 11,000+ U.S.-listed stocks and ETFs directly through the
//    Musaffa Halal Investing Platform"   https://musaffa.com/pricing/
// So N = 11,000 over shares, ETFs and ETNs together: the 11,000 lines with
// the highest 30-day average daily traded value in dollars, ranked by
// ../wellstrade/usPopular.mjs (topN). Not used as counts of the offer: the
// menu's "Pick from 11,000+ screened US stocks" / "1,000+ screened funds"
// and the "6,403 total" stocks / "3,764 total" ETFs, which count what the
// halal screener covers, not what the platform trades.
//
//   https://musaffa.com/halal-investing-pricing/
//   https://musaffa.com/pricing/
//   https://musaffa.com/assets/Form-ADV-Part-2A.pdf
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the pages say
// "U.S. listed" (the OTC rate in the fee schedule is Alpaca's own CAT fee
// table).
// Not a removal, a remark: the halal rating of each line (Halal, Doubtful,
// Not Halal) is the client's call; the country list shows the United
// States as "U.S. market access in preparation".
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees (no trading commissions; platform fee from $5 a month under $24,000,
// then 0.25% to 0.10% a year; FX 1% of notional; regulatory fees absorbed):
//   https://musaffa.com/halal-investing-pricing/
//   https://musaffa.com/trading-service-fee-schedule/
//
//   node brokers/musaffa/musaffa_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const N = 11_000; // "Trade 11,000+ U.S. stocks and ETFs"
const PAGE = "https://musaffa.com/halal-investing-pricing/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /no trading commissions/i,
  /Trade 11,000\+ U\.S\. stocks and ETFs commission-free/i,
]);
await sleep(1000);

const rows = await usBook();
const offered = withoutObligations(rows);
const top = await topN(offered, N);
const chosen = new Set(top);
const kept = stampRows(offered.filter((row) => chosen.has(row)));
if (kept.length !== N) throw new Error(`${kept.length} rows, not ${N}`);
fs.writeFileSync(new URL("musaffa-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(rows.report.directories)}; halts: ${rows.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (offered.length < rows.length) console.error(`${rows.length - offered.length} bonds left out`);
console.error(`owner rule: the ${N} most popular of ${top.report.among} lines; #${top.report.cutoff.rank} ${top.report.cutoff.text}; first left out ${top.report.firstLeftOut}; kept with no data ${top.report.keptNoData}, by size only ${top.report.keptSizeOnly}`);
