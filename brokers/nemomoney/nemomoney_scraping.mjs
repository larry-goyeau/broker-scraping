// What Nemo (nemo.money, run by Exinity ME Limited, ADGM / FSRA licence
// 200015) sells in real shares and ETFs, with no login. The stocks page
// says "Choose from over 6,000 stocks, including 500 global giants, and
// 2,000 ETFs"; the pricing page says "Invest in over 6,000 US and global
// stocks, plus 2,000 ETFs without any fees"; the terms say "All Equities
// offered are listed on an exchange". The FAQ speaks of "US-based stocks
// and ETFs traded on Nemo" and of fractional shares. No list of titles is
// published outside the app, and no page names a board, a segment or a
// kind of listed share or fund left out. The book they are taken from is
// the whole US exchange book of the day (../wellstrade/usBook.mjs):
// shares, ADRs, REITs, partnership units, preferreds, closed-end funds,
// ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the
// Texas Stock Exchange, less the lines with an open trade halt. The
// "global giants" are read as the foreign companies' US lines (ADRs and
// ordinary shares listed in New York): no page names an exchange outside
// the US, so both figures are the size of the offer on this place.
//
//   https://nemo.money/stocks-etfs
//   https://nemo.money/pricing/stocks
//   https://nemo.money/faq/investing-with-nemo
//   https://nemo.money/nemo-terms-of-use   (Cash Equities)
//
// Owner rule 2026-10-25: the N most popular, per kind. "Invest in over
// 6,000 US and global stocks, plus 2,000 ETFs without any fees" (pricing
// page): N = 6,000 shares (book type STOCK: shares, ADRs, REITs,
// preferreds, closed-end funds) and N = 2,000 ETFs (book types ETF and
// ETN, the exchange-traded products, ranked together), each the most
// popular of its kind by 30-day average traded value in dollars
// (../wellstrade/usPopular.mjs).
//   https://nemo.money/pricing/stocks
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the terms say
// the equities offered are exchange listed. The "Boost" account (CFDs on
// indices, commodities, FX and crypto) is not this catalogue. The US is
// one NBBO market: one row per title, on its primary listing, in dollars.
//
// Fees ("zero commissions and no monthly fee"; "Investing with us is
// totally commission-free, and we don't receive any portion of spread
// from stock and ETF trading"; Nemo is paid for routing orders):
//   https://nemo.money/pricing/stocks
//
//   node brokers/nemomoney/nemomoney_scraping.mjs

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
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|’/g, "'").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://nemo.money/pricing/stocks", [
  /Invest in over 6,000 US and global stocks, plus 2,000 ETFs without any fees/i,
  /totally commission-free/i,
]);
await pause();
await evidence("https://nemo.money/stocks-etfs", [/over 6,000 stocks, including 500 global giants, and 2,000 ETFs/i]);
await pause();
await evidence("https://nemo.money/nemo-terms-of-use", [/All Equities offered are listed on an exchange/i]);

const KINDS = [["shares", ["STOCK"], 6000], ["ETFs", ["ETF", "ETN"], 2000]];
const book = await usBook();
const all = stampRows(withoutObligations(book));
if (all.length < 10000) throw new Error(`only ${all.length} rows in the book`);
const rows = [];
for (const [label, types, n] of KINDS) {
  const kept = await topN(all, n, { types });
  if (kept.length !== n) throw new Error(`only ${kept.length} ${label}`);
  rows.push(...kept);
  const { report } = kept;
  console.error(`kept the ${n} most popular ${label} of ${report.among}; #${n}: ${report.cutoff.text}; first left out: ${report.firstLeftOut}`);
}
fs.writeFileSync(new URL("nemomoney-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (all.length < book.length) console.error(`${book.length - all.length} bonds left out`);
