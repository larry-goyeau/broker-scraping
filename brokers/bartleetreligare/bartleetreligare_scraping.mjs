// What Bartleet Religare Securities sells on the Colombo Stock Exchange,
// with no login. It is "Member of the Colombo Stock Exchange" and runs an
// online trading account on the CSE. Its FAQ gives the fee schedule
// ("Up to Rs. 100Mn Brokerage Fees - 0.640%") and names no board, segment
// or share class it does not trade. The FAQ line "There could be a
// restriction from our end or CSE side" is about a client's account, not a
// security, so it is a remark, not a removal. The catalogue is the whole
// Colombo share book.
//
//   https://www.bartleetreligare.com/faqs/   (fees and online trading FAQ)
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
//   node brokers/bartleetreligare/bartleetreligare_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { cseBook, cseHalted } from "../asialk/cseBook.mjs";

const OUTPUT = new URL("bartleetreligare-parsed.json", import.meta.url);

const rows = await cseBook();
if (rows.length < 250) throw new Error(`only ${rows.length} Colombo shares came back`);
if (rows.some((row) => !/\.(N|X|P)\d{4}$/.test(row.ticker))) throw new Error("a line that is not a share stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const halted = Object.keys(await cseHalted());
const withIsin = stamped.filter((row) => row.isin).length;
console.error(`${stamped.length} listings, ${withIsin} with an ISIN; ${halted.length} suspended left out: ${halted.join(", ")}`);
