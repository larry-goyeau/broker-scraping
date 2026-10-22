// What ABC Capital sells in shares and exchange-traded funds, with no
// login. ABC Capital is a Nairobi Securities Exchange member. It says it
// offers "a platform for all clientele to trade Listed securities", and
// its trading fees are on its FAQ page. It publishes no list of its own.
// Its Market Beat page embeds the myStocks market watch, which is the
// whole NSE board. That board is the book.
// The board is read by nseke.mjs, shared with the other NSE brokers
// reached through Dosikaa. It keeps shares, preference shares, REITs and
// ETFs, and leaves out rights, the six suspended codes, codes with no
// trade in 180 days and LAPR (restricted sub-segment). ALP and TRFC are
// the two US-dollar REITs. ISINs come from the NSE listed-companies page.
// See nseke.mjs for the details.
//
//   https://www.abccapital.co.ke/securities-brokerage/
//   https://www.abccapital.co.ke/faqtwo/
//   https://www.abccapital.co.ke/market-beat/
//   https://live.mystocks.co.ke/cobrand/v1/rmwx/ABC
//   https://tickers.mystocks.co.ke/ticker/RMWX$?app=ABC
//   https://live.mystocks.co.ke/ajax/stocksectors/<yyyymmddhh>
//   https://live.mystocks.co.ke/stock=<code>
//   https://www.nse.co.ke/listed-companies/
//
//   node brokers/abccapital/abccapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { readNseBoard, nseSummary } from "./nseke.mjs";
import fs from "node:fs";

const board = await readNseBoard();
fs.writeFileSync(new URL("abccapital-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(board.rows)), null, 2));
console.error(nseSummary(board));
