// What American Century Brokerage (a division of American Century
// Investment Services, Inc., cleared by Pershing) sells, with no login.
// Its brokerage page says it "provides you access to a full range of
// individual securities and investment vehicles", and the commission
// schedule (effective 15 February 2026) prices "Equities (Common Stock,
// Preferred Stock and ETFs)": $9.95 to $24.95 a trade by client tier,
// with 2 cents a share over 1,000 shares, a $250 cap above $1 a share,
// and American Century and Avantis ETFs commission-free. It names no list
// of securities and no segment or kind of share it does not take, and it
// publishes no security list of its own. So the book is the whole US
// exchange book of the day, read by ../wellstrade/usBook.mjs (shares,
// ADRs, REITs, preferreds, closed-end funds, ETFs and ETNs on Nasdaq,
// NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock Exchange;
// warrants, rights, units, when-issued lines, listed notes and halted
// lines are left out there). The US is one NBBO market: one row per title
// on its primary listing, in dollars. Mutual funds, bonds, CDs, UITs
// (sell only) and precious metals are not exchange-listed shares and are
// not here; neither are OTC Markets lines, which the schedule does not
// name.
//
//   https://www.americancentury.com/invest/accounts/brokerage/commissions-and-fees/   (fees)
//   https://www.americancentury.com/invest/accounts/brokerage/
//
//   node brokers/americancentury/americancentury_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FEES = "https://www.americancentury.com/invest/accounts/brokerage/commissions-and-fees/";
const BROKERAGE = "https://www.americancentury.com/invest/accounts/brokerage/";

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(FEES, [
  /Equities are considered common stock, preferred stock, and ETFs/i,
  /Equities \(Common Stock, Preferred Stock and ETFs\) more than \$1 per share/i,
  /\$9\.95/,
  /\$24\.95 \+ 2¢\/share for each additional share over 1,000/,
]);
await new Promise((resolve) => setTimeout(resolve, 1000));
await evidence(BROKERAGE, [/access to a full range of individual securities and investment vehicles/i]);

const rows = stampRows(withoutObligations(await usBook()));
fs.writeFileSync(new URL("americancentury-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
