// What One Nevada Credit Union sells in shares and exchange-traded
// products through OneNVest, read with no login. OneNVest is run by Atomic
// Invest (SEC registered investment adviser) and Atomic Brokerage (FINRA/
// SIPC broker-dealer, clearing and custody at Pershing LLC). Besides
// automated portfolios, which "do not support self-directed trading of
// individual securities", the self-directed account lets the member "trade
// fractional shares of stocks and ETFs with as little as a dollar and no
// commissions"; the FAQ says "you can trade fractional shares of a
// selection of stocks and ETFs", and a footnote adds "only a limited number
// of stocks are available to trade" and "Full-share trading and stock
// transfers are not supported".
//
//   https://www.onenevada.org/onenvest
//
// The selection is not published (Atomic's fractional share trading
// disclosure says only that it may change the eligible list at any time),
// and no page names a board, segment or kind of listed share it leaves
// out. So the book is the whole US exchange book of the day, read by
// ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas Stock Exchange; warrants, rights, units, when-issued lines,
// listed notes and halted lines are left out there), as for the other
// portals whose selection is not public (../chimeus, also Atomic). Many of
// its lines are not in the app; nothing public says which. Bonds
// (withoutObligations) are out. The US is one NBBO market: one row per
// title on its primary listing, in dollars. "$0 commissions charged on
// trades of U.S. listed registered securities" names listed lines only, so
// OTC Markets lines are not added.
//
//   https://legal.atomicvest.com/usa.brokerage.fractional-share-trading-disclosure-c45802df-6ff3-49d5-b4ad-677ed4afd0d4.pdf
//
// Remarks, not removals: One Nevada membership required; fractional
// (dollar) orders only, during regular US trading hours.
//
// Fees (same page): "$0 commissions on U.S. stock trades"; self-directed
// FAQ: "there are $0 commissions charged on trades of U.S. listed
// registered securities" placed "during the U.S. markets' regular trading
// hours"; "Other fees such as regulatory fees, exchange fees, wire transfer
// fees and account maintenance fees may apply. See Atomic Brokerage's fee
// schedule for more details."
//
//   https://www.onenevada.org/onenvest
//
// onenevada.org answers scripts with a Cloudflare block (403) at times; the
// page check below then only warns, as ../chimeus does without a check.
//
//   node brokers/onenevadacreditu/onenevadacreditu_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.onenevada.org/onenvest";

// The page still says what the header quotes, or the run stops. A
// Cloudflare block is not an answer, so it only warns.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  if (response.status === 403 && /cloudflare/i.test(body)) {
    console.error(`warning: ${url} is behind a Cloudflare block, page not re-read`);
    return;
  }
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = body.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#0?36;/g, "$").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /\$0 commissions/i,
  /fractional shares of a selection of stocks and ETFs/i,
  /Atomic Brokerage/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("onenevadacreditu-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
