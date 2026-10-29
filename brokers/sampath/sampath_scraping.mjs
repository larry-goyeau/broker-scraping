// What Sampath Securities (formerly SC Securities, the stockbroker of
// Sampath Bank) sells on the Colombo Stock Exchange, with no login. Its
// only place is the CSE. The home page's last step is "Start Trading Log
// in to our online portal or mobile app to access real-time market data
// ... and place your first buy order", and the portal is the ATrad site
// itrade.sampathsecurities.lk. The client agreement it publishes prices
// equity: "Transaction cost applicable for equity & debt securities ...
// Transactions up to Rs 100 million — 1.12 %", of which "Brokerage Fees
// 0.640%", and a "Minimum Brokerage (Floor) 0.2000%" above Rs 100 million.
// No page names a board, share class or security the portal does not
// carry, so the catalogue is the whole Colombo share book.
//
//   https://www.sampathsecurities.lk/
//   https://www.sampathsecurities.lk/wp-content/uploads/docs/client-agreemen-and-risk-disclosure.pdf  (fees)
//
// Left out, as on every Colombo scraper here: lines the exchange lists as
// trading suspended, dealing suspended or halted, delisted or never-traded
// lines, rights (.R), warrants (.W), debentures (.D) and closed-end fund
// units (.U). Voting (.N), non-voting (.X) and preference (.P) shares stay.
// Colombo lists no ETF, ETN or ETC today. Every line trades in rupees.
// The book and the ISINs come from the exchange through ../asialk/cseBook.mjs.
//
//   node brokers/sampath/sampath_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { cseBook, cseHalted } from "../asialk/cseBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

const OUTPUT = new URL("sampath-parsed.json", import.meta.url);
const FEES = "https://www.sampathsecurities.lk/wp-content/uploads/docs/client-agreemen-and-risk-disclosure.pdf";

await pageSays("https://www.sampathsecurities.lk/", [/online portal or mobile app/i, /itrade\.sampathsecurities\.lk/i], { raw: true });
// The fee schedule is a PDF: check that it is still served.
const fees = await fetch(FEES, { method: "HEAD", signal: AbortSignal.timeout(60_000) });
if (!fees.ok || !/pdf/i.test(fees.headers.get("content-type") || "")) throw new Error(`${FEES} answered ${fees.status}`);

const rows = await cseBook();
if (rows.length < 250) throw new Error(`only ${rows.length} Colombo shares came back`);
if (rows.some((row) => !/\.(N|X|P)\d{4}$/.test(row.ticker))) throw new Error("a line that is not a share stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const halted = Object.keys(await cseHalted());
const withIsin = stamped.filter((row) => row.isin).length;
console.error(`${stamped.length} listings, ${withIsin} with an ISIN; ${halted.length} suspended left out: ${halted.join(", ")}`);
