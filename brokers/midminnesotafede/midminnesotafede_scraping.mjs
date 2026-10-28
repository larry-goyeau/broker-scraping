// What Mid Minnesota Federal Credit Union sells, with no login. Its
// "Securities & ETFs" page offers Self-Guided investing in "the InvestiFi
// Investment Portal within Online Banking or the Mobile App" (brokerage
// services by InvestiFi Securities LLC, custody at RQD Clearing LLC):
// "You can buy, sell and hold stocks and ETFs all within the InvestiFi
// Investment Portal". Fees: "Invest any amount self-guided from $1 to
// $250,000 per transaction with no purchase fees." The page names no
// sale fee; Bluestone FCU, on the same InvestiFi portal, says "The cost to
// trade securities is free". The page names no list of securities and no
// segment, board or kind of share it does not take; the list sits inside
// the portal, behind online banking. InvestiFi's partner announcements
// speak of "more than 6,500 stocks and ETFs", but no list is public, so
// the book is the whole US exchange book of the day, read by
// ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas Stock Exchange; warrants, rights, units, when-issued
// lines, listed notes and halted lines are left out there). The US is one
// NBBO market: one row per title on its primary listing, in dollars. OTC
// Markets lines are not named on the page and are not in the book.
// Crypto and the Guided (managed ETF) portfolios are not here.
//
// Not a removal, a remark: "Account holders residing in TX, ID, or NY are
// unable to trade", brokerage is "available only to residents of the
// United States", members must be over 18 and in good standing, and
// commercial accounts are not supported.
//
//   https://www.mmfcu.org/digital-investing/securities-etfs   (offer and fees)
//   https://www.mmfcu.org/digital-investing
//
//   node brokers/midminnesotafede/midminnesotafede_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.mmfcu.org/digital-investing/securities-etfs";

// The page still says what the header quotes, or the run stops. The site
// sits behind a Cloudflare challenge that often answers scripts with 403;
// then the check is only reported (the quotes were read on 2026-10-25).
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (response.status === 403 && /cloudflare/i.test(response.headers.get("server") || "")) {
    console.error(`${url}: Cloudflare challenge (403), page check skipped`);
    return;
  }
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /no purchase fees/i,
  /buy, sell and hold stocks and ETFs/i,
  /InvestiFi/,
]);

const rows = stampRows(withoutObligations(await usBook()));
fs.writeFileSync(new URL("midminnesotafede-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
