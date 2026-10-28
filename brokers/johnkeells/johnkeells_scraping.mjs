// What John Keells Stock Brokers sells on the Colombo Stock Exchange, with
// no login. "Trading is led by the Colombo Stock Exchange"; the online app
// (DirectFN) shows "Full Market Watch Lists" for the CSE. The brokerage
// page says the fee "up to the value of Rs. 100 million is fixed by the
// Colombo Stock Exchange and are common to all brokers". For foreign
// clients it says an SIA lets them "trade in any listed security without
// any restrictions"; the 40 % plantation and 10 % bank ownership caps are
// per-holder limits, so they are remarks, not removals. No board, segment
// or share class is excluded: the catalogue is the whole Colombo share book.
//
//   https://www.jksb.com/jksb_venture_with_us/#brokerage   (fees)
//   https://www.jksb.com/storage/JKSB-Online-Trading-Guide.pdf
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
//   node brokers/johnkeells/johnkeells_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { cseBook, cseHalted } from "../asialk/cseBook.mjs";

const OUTPUT = new URL("johnkeells-parsed.json", import.meta.url);

const rows = await cseBook();
if (rows.length < 250) throw new Error(`only ${rows.length} Colombo shares came back`);
if (rows.some((row) => !/\.(N|X|P)\d{4}$/.test(row.ticker))) throw new Error("a line that is not a share stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const halted = Object.keys(await cseHalted());
const withIsin = stamped.filter((row) => row.isin).length;
console.error(`${stamped.length} listings, ${withIsin} with an ISIN; ${halted.length} suspended left out: ${halted.join(", ")}`);
