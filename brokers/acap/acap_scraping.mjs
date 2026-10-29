// What ACAP Stock Brokers sells on the Colombo Stock Exchange, with no login.
// Its only place is the CSE. The site's "Online Trading" menu opens the
// ATrad web platform (online.acapstockbrokers.lk/atsweb), and the services
// page prices "Share Transactions": "Fee Structure is implemented for any
// equity, as a percentage of the total Rupee value of the securities
// purchased or sold on your behalf", "Transaction Cost up tp Rs.100Mn
// (Total 1.12%)", with "a minimum brokerage floor of 0.20%" above that.
// No page names a board, share class or security that the platform does
// not carry, so the catalogue is the whole Colombo share book.
//
//   https://acapstockbrokers.lk/            (menu: Online Trading -> ATrad)
//   https://acapstockbrokers.lk/services/   (fees: 1.12 % up to LKR 100 million)
//
// Left out, as on every Colombo scraper here: lines the exchange lists as
// trading suspended, dealing suspended or halted, delisted or never-traded
// lines, rights (.R), warrants (.W), debentures (.D) and closed-end fund
// units (.U). Voting (.N), non-voting (.X) and preference (.P) shares stay.
// Colombo lists no ETF, ETN or ETC today. Every line trades in rupees.
// The book and the ISINs come from the exchange through ../asialk/cseBook.mjs.
//
//   node brokers/acap/acap_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { cseBook, cseHalted } from "../asialk/cseBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

const OUTPUT = new URL("acap-parsed.json", import.meta.url);

await pageSays("https://acapstockbrokers.lk/", [/online\.acapstockbrokers\.lk\/atsweb/i], { raw: true });
await pageSays("https://acapstockbrokers.lk/services/", [/Transaction Cost up t[op] Rs\.?\s?100\s?Mn \(Total 1\.12%\)/i]);

const rows = await cseBook();
if (rows.length < 250) throw new Error(`only ${rows.length} Colombo shares came back`);
if (rows.some((row) => !/\.(N|X|P)\d{4}$/.test(row.ticker))) throw new Error("a line that is not a share stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const halted = Object.keys(await cseHalted());
const withIsin = stamped.filter((row) => row.isin).length;
console.error(`${stamped.length} listings, ${withIsin} with an ISIN; ${halted.length} suspended left out: ${halted.join(", ")}`);
