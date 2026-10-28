// What Capital TRUST Securities sells on the Colombo Stock Exchange, with
// no login. Clients trade online through ATrad ("Atrad Online System")
// on the CSE. Its knowledge hub gives the fee by reference: "There are
// fixed fees that are levied by all the brokering firms as directed by the
// Colombo Stock Exchange", linking the exchange's table
// (https://www.cse.lk/pages/transaction-costs/transaction-costs.component.html,
// 1.12 % up to Rs. 100 million, brokerage 0.64 %). No page names a board,
// segment or share class it does not trade, so the catalogue is the whole
// Colombo share book.
//
//   https://capitaltrust.lk/knowledge-hub/   (fees, online trading FAQ)
//   https://capitaltrust.lk/
//
// Left out, as on every Colombo scraper here: lines the exchange lists as
// trading suspended, dealing suspended or halted, delisted or never-traded
// lines, rights (.R), warrants (.W), debentures (.D) and closed-end fund
// units (.U). Voting (.N), non-voting (.X) and preference (.P) shares stay.
// Colombo lists no ETF, ETN or ETC today. Every line trades in rupees.
// The book and the ISINs come from the exchange through ../asialk/cseBook.mjs:
//   https://www.cse.lk/api/allSecurityCode
//   https://www.cse.lk/api/listedEntitiesByTradingStatus (TS, DS, TH)
//   https://www.cse.lk/listed-entities/trading-status
//   https://www.cse.lk/api/deListedEntities
//   https://www.cse.lk/api/companyInfoSummery
//
//   node brokers/trustlk/trustlk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { cseBook, cseHalted } from "../asialk/cseBook.mjs";

const OUTPUT = new URL("trustlk-parsed.json", import.meta.url);

const rows = await cseBook();
if (rows.length < 250) throw new Error(`only ${rows.length} Colombo shares came back`);
if (rows.some((row) => !/\.(N|X|P)\d{4}$/.test(row.ticker))) throw new Error("a line that is not a share stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const halted = Object.keys(await cseHalted());
const withIsin = stamped.filter((row) => row.isin).length;
console.error(`${stamped.length} listings, ${withIsin} with an ISIN; ${halted.length} suspended left out: ${halted.join(", ")}`);
