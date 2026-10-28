// What Huntington Bank's self-directed brokerage sells, with no login. The
// SmartInvest page says: "As a SmartInvest client with a funded Managed
// Investment account, you can open a new brokerage account through
// Huntington Financial Advisors and access unlimited commission-free
// online trades in equities and ETFs". Its footnote gives the tariff and
// the channel: Huntington Financial Advisors is "a financial advisory
// practice of Ameriprise Financial Services, LLC", and the offer "consists
// of unlimited commission-free, trades for equities and exchange-traded
// funds, limited to self-directed orders entered as market orders ...
// through the secure site at ameriprise.com. An order handling fee of
// $6.00 will still apply to these orders." The Private Bank's SmartInvest
// page says the same ("unlimited commission-free, self-directed online
// equity and/or ETF trades"). Neither names a list of securities or a
// segment, board or kind of share it does not take, and no security list
// is published. So the book is the whole US exchange book of the day, read
// by ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas Stock Exchange; warrants, rights, units, when-issued
// lines, listed notes and halted lines are left out there). The US is one
// NBBO market: one row per title on its primary listing, in dollars. OTC
// Markets lines are not named on the pages and are not in the book.
//
// Not a removal, a remark: the offer is only for clients with "1) a
// SmartInvest Checking account and 2) an open and funded Managed
// Investment account with Huntington Private Bank or Huntington Financial
// Advisors", and only market orders are commission-free.
//
//   https://www.huntington.com/Personal/savings-cds-overview/smartinvest-money-market-account   (offer and fees)
//   https://www.huntington.com/private-bank/solutions/banking-lending/smartinvest
//
//   node brokers/huntington/huntington_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MONEY_MARKET = "https://www.huntington.com/Personal/savings-cds-overview/smartinvest-money-market-account";
const PRIVATE_BANK = "https://www.huntington.com/private-bank/solutions/banking-lending/smartinvest";

// The pages still say what the header quotes, or the run stops. (Huntington's
// bot wall answers curl with 403 but lets Node's fetch through.)
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|&reg;|\s+/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(MONEY_MARKET, [
  /unlimited commission-free online trades in equities and ETFs/i,
  /unlimited commission-free, trades for equities and exchange-traded funds/i,
  /An order handling fee of \$6\.00 will still apply to these orders/i,
]);
await new Promise((resolve) => setTimeout(resolve, 1000));
await evidence(PRIVATE_BANK, [/unlimited commission-free, self-directed online equity and\/or ETF trades/i]);

const rows = stampRows(withoutObligations(await usBook()));
fs.writeFileSync(new URL("huntington-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
