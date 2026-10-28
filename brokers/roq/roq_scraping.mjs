// What ROQ Markets (the app of ROQ Capital OJSC, ex-Armbrok, licensed by
// the Central Bank of Armenia; US securities held through "a U.S.-registered
// broker-dealer that is a member of FINRA and SIPC") sells in shares and
// exchange-traded products, with no login. Its page says "Trade US stocks
// and ETFs", lists under "What you can trade" "Stocks Common, Preferred"
// and "ETFs Index, Sector, Thematic" ("14,000 + securities"), and its FAQ
// answers "What instruments can I trade on ROQ Markets? You can currently
// trade US stocks and ETFs." No page names a board, a segment or a kind of
// listed share or fund it does not sell, so the catalogue is the whole US
// exchange book of the day (../wellstrade/usBook.mjs): shares, ADRs,
// REITs, partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt. The app's list itself
// is not public.
//
//   https://roqcapital.am/en/roqmarkets
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations; the page shows bonds and options as "Coming soon").
// OTC Markets lines are not added: the pages say "US stocks and ETFs" and
// never mention over-the-counter trading, so the "14,000+" is not read as
// a promise of OTC lines. The US is one NBBO market: one row per title, on
// its primary listing, in dollars (deposits in AMD, USD, EUR and RUB are
// converted in the app).
//
// Owner rule 2026-10-25: the N most popular. The page gives the size of
// the offer, "14,000 + SECURITIES ONE APP" (image text "14,000+ securities
// in one app"), one count for the US stocks and ETFs together, so N =
// 14,000 across the book's shares, ETFs and ETNs, ranked by 30-day average
// traded value in dollars (../wellstrade/usPopular.mjs). The book holds
// about 12,200 lines, fewer than N, so the cut keeps them all today.
//
// Remarks, not removals: "24/5 trading is available for selected supported
// instruments" and fractional trading "for eligible shares"; market and
// limit orders only.
//
// Fees (0.15% of trade value or USD 0.015 per security, whichever is
// higher, minimum USD 1; regulatory fees on sales on top):
//   https://roqcapital-media.s3.eu-north-1.amazonaws.com/Tariffs_2026_Sep_ROQ_Markets_en_90af615102.pdf
//
//   node brokers/roq/roq_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://roqcapital.am/en/roqmarkets";

// The page still says what the header quotes, or the run stops. The FAQ
// answers sit in the page's Next.js data, so the whole source is read.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\n/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;| /g, " ")
    .replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /Trade US stocks and ETFs/i,
  /You can currently trade US stocks and ETFs/i,
  /Stocks Common, Preferred/i,
  /0\.15% of trade value/i,
  /14,000 ?\+ ?securities/i,
]);

const N = 14000;
const book = await usBook();
const all = withoutObligations(book);
const top = await topN(all, N);
const kept = new Set(top);
const rows = stampRows(all.filter((row) => kept.has(row)));
if (rows.length < Math.min(N, 10000)) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("roq-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
console.error(`top ${N} of ${all.length} lines: ${rows.length} kept; last kept ${top.report.cutoff.text}; first left out: ${top.report.firstLeftOut || "none"}`);
