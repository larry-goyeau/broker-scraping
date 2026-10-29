// What Desktop Broker sells online as shares and ETFs on the ASX and Cboe
// Australia, with no login.
//
// "You can trade all ASX listed securities at your desk or on-the-go. ASX
// listed equities & company options, ETFs, Warrants"; "The Desktop Broker
// service is provided by Third Party Platform Pty Limited trading as
// "Desktop Broker" ... a Participant of the ASX Limited Group and a Trading
// Participant of Cboe Australia."
//   https://desktopbroker.com.au/what-you-can-trade
// FAQ: "With Desktop Broker you can trade all CHESS approved equities,
// interest rate securities and warrants listed on the Australian Stock
// Exchange"; "You can place orders online up to the value of $250,000."
//   https://www.desktopbroker.com.au/shareschool/faqs/tradingsettlement.html
// Desktop Broker publishes no list of what it sells.
//
// Places: ASX and Cboe Australia, as the pages and broker-list.json give
// them. So the catalogue is every share and ETF quoted on the ASX and the
// Cboe Australia book of each, read by ../netwealth/australia.mjs (the ASX
// list of listed entities, the ASX investment-products report, Cboe
// Australia's tradable and listed files), one row per place, as
// ../netwealth does. Company options, warrants and interest-rate
// securities are not shares or ETFs and are left out (withoutObligations
// for the hybrids and notes). mFunds are open-ended funds settled through
// the ASX, not exchange-traded, and are not read.
//
// Fees: same FAQ, "You will be charged the internet rate which is $18.18
// for trades up to $10,000, $25 for trades between $10,000 and $25,000 or
// 0.1% for trades above $25,000."
//
//   node brokers/desktopbroker/desktopbroker_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { australianRows, logCounts } from "../netwealth/australia.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://desktopbroker.com.au/what-you-can-trade", [/trade all ASX listed securities/, /Trading Participant of Cboe Australia/]);
await pageSays("https://www.desktopbroker.com.au/shareschool/faqs/tradingsettlement.html", [/internet rate which is \$18\.18/]);

const { rows, dropped } = await australianRows({ places: ["ASX", "Cboe Australia"] });
for (const [ticker, exchange] of [["BHP", "ASX"], ["BHP", "Cboe Australia"], ["VAS", "ASX"]]) {
  if (!rows.some((row) => row.ticker === ticker && row.exchange === exchange)) throw new Error(`${ticker} is missing on ${exchange}`);
}
const kept = stampRows(withoutObligations(rows));
if (kept.filter((r) => r.exchange === "ASX").length < 2000) throw new Error("ASX book too small");
fs.writeFileSync(new URL("desktopbroker-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
logCounts(rows, dropped);
