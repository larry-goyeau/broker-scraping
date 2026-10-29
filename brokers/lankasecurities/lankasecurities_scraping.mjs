// What Lanka Securities sells on the Colombo Stock Exchange, with no login.
// Its only place is the CSE. The online trading page says "we offer a
// several online trading platforms" and names one, "ATrad delivers an
// innovative trading tool ... to make your online investing faster";
// "To get online trading service you must have a CDS account with LSL".
// The getting-started page prices equity: "Transactions up to Rs. 100
// Million - 1.12% Divided as follows: Brokerage Fees 0.640% CSE Fees
// 0.084% CDS Fees 0.024% SEC Cess 0.072% Share transaction levy 0.300%",
// and a "Minimum brokerage (floor) 0.200%" above that. No page names a
// board, share class or security the platform does not carry, so the
// catalogue is the whole Colombo share book.
//
//   https://lankasecurities.com/online-trading.php
//   https://lankasecurities.com/getting-started.php   (fees)
//
// Left out, as on every Colombo scraper here: lines the exchange lists as
// trading suspended, dealing suspended or halted, delisted or never-traded
// lines, rights (.R), warrants (.W), debentures (.D) and closed-end fund
// units (.U). Voting (.N), non-voting (.X) and preference (.P) shares stay.
// Colombo lists no ETF, ETN or ETC today. Every line trades in rupees.
// The book and the ISINs come from the exchange through ../asialk/cseBook.mjs.
//
//   node brokers/lankasecurities/lankasecurities_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { cseBook, cseHalted } from "../asialk/cseBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

const OUTPUT = new URL("lankasecurities-parsed.json", import.meta.url);

await pageSays("https://lankasecurities.com/online-trading.php", [/ATrad delivers an innovative trading tool/i, /online trading service/i]);
await pageSays("https://lankasecurities.com/getting-started.php", [/Transactions up to Rs\. ?100 Million - 1\.12%/i, /Brokerage Fees 0\.640%/i]);

const rows = await cseBook();
if (rows.length < 250) throw new Error(`only ${rows.length} Colombo shares came back`);
if (rows.some((row) => !/\.(N|X|P)\d{4}$/.test(row.ticker))) throw new Error("a line that is not a share stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const halted = Object.keys(await cseHalted());
const withIsin = stamped.filter((row) => row.isin).length;
console.error(`${stamped.length} listings, ${withIsin} with an ISIN; ${halted.length} suspended left out: ${halted.join(", ")}`);
