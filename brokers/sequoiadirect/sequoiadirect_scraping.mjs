// What Sequoia Direct sells (a trading name of Sequoia Wealth Management Pty
// Ltd, AFSL 472387; execution and clearing through Morrison Securities, whose
// Equix app it gives clients): Australian shares on the ASX, online or by
// phone. It has no list of its own, so the catalogue is the whole ASX book:
// every quoted share and exchange-traded product, in AUD.
//
//   "Sequoia Direct caters to self directed investors looking for a fast and
//   secure execution only service for buying or selling Australian Shares."
//     https://www.sequoiadirect.com.au/services/trading-shares/
//   Fee page: "ASX Shares and Warrants ASX rates - Starting form $12.00 or
//   0.08%, whichever is greater (plus GST)".
//     https://www.sequoiadirect.com.au/trading/rates-and-fees/
//   The Financial Services Guide (v17, 17 February 2025) names the products:
//   "exchange traded financial products (e.g. shares, listed managed
//   investment schemes, exchange traded options and warrants)".
//     https://www.sequoiadirect.com.au/wp-content/uploads/2025/02/Josh-Graham-merged-FSG-v17-17-February-2025.pdf
//
// ETFs are kept: listed managed investment schemes are named, and no page
// excludes them. Warrants and exchange-traded options are sold but are
// derivatives and stay out, as in the other scrapers. No international
// shares: no page names any market but the ASX. Place: ASX only. No
// Sequoia page names Cboe Australia, so lines quoted on Cboe alone stay
// out. The margin lender's approved-shares list (Leveraged Equities) only
// limits what a margin client can buy on credit, so it is not applied.
//
// The ASX book comes from ../sequoiadirect/asxBook.mjs (over
// ../netwealth/australia.mjs): it leaves out options, warrants, hybrids,
// preference shares, deferred-settlement, contributing and partly-paid
// lines, and suspended or delisted codes.
//
//   node brokers/sequoiadirect/sequoiadirect_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { fetchWith, pageText } from "../netwealth/australia.mjs";
import { asxBook, logCounts } from "./asxBook.mjs";

const SHARES = "https://www.sequoiadirect.com.au/services/trading-shares/";
const FEES = "https://www.sequoiadirect.com.au/trading/rates-and-fees/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shares = pageText(await fetchWith(SHARES));
if (!/execution only service for buying or selling Australian Shares/i.test(shares)) {
  throw new Error(`${SHARES} no longer offers Australian shares`);
}
if (/\b(international|global|US|overseas) (shares|markets|equities)\b/i.test(shares)) {
  throw new Error(`${SHARES} now speaks of foreign shares: look for a list`);
}
await sleep(1500);
const fees = pageText(await fetchWith(FEES));
if (!/ASX Shares and Warrants/i.test(fees) || !/\$12\.00 or 0\.08%/.test(fees)) {
  throw new Error(`${FEES} no longer shows the ASX share tariff`);
}
if (/\b(Cboe|Chi-X)\b/i.test(shares + fees)) console.error("Sequoia now names Cboe Australia: consider adding that place");

const { rows, dropped } = await asxBook();
for (const ticker of ["BHP", "CBA", "VAS", "NWSLV"]) {
  if (!rows.some((row) => row.ticker === ticker && row.exchange === "ASX")) throw new Error(`${ticker} is missing on the ASX`);
}

fs.writeFileSync(new URL("sequoiadirect-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
logCounts(rows, dropped);
