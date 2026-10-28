// What Truist Trade (Truist Investment Services, Inc., the self-directed
// brokerage of Truist Bank) sells, with no login. Its page offers
// "self-directed online equity trading" and prices "common stock and
// exchange-traded funds (ETFs)": "$0 Commission fees for 1,000 or fewer
// shares per order of Common Stock and ETFs. $0.03 per share of Common
// Stock and ETFs if the lot size exceeds 1,000 shares." Options are priced
// apart. It names no list of securities and no segment, board or kind of
// share it does not take, and it publishes no security list of its own.
// So the book is the whole US exchange book of the day, read by
// ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas Stock Exchange; warrants, rights, units, when-issued
// lines, listed notes and halted lines are left out there). The US is one
// NBBO market: one row per title on its primary listing, in dollars.
// OTC Markets lines are not offered on the page and are not in the book.
//
// Not a removal, a remark: the account is "Only current Truist Financial
// Corporation Clients", with a $1,000 minimum initial funding and a $100
// minimum equity buy, and the fees above plus annual subscription, custody
// and IRA fees ($60 each, with ways to waive).
//
//   https://www.truist.com/investing-retirement/self-directed-investing   (offer and fees)
//
//   node brokers/truisttrade/truisttrade_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.truist.com/investing-retirement/self-directed-investing";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /self-directed online equity trading/i,
  /\$0 Commission fees for 1,000 or fewer shares per order of Common Stock and ETFs/i,
  /\$0\.03 per share of Common Stock and ETFs if the lot size exceeds 1,000 shares/i,
]);

const rows = stampRows(withoutObligations(await usBook()));
fs.writeFileSync(new URL("truisttrade-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
