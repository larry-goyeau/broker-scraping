// What NDB Securities sells on the Colombo Stock Exchange, with no login.
// Its internet trading agreement says "orders will generally be routed to
// the CSE ATS systems", and the FAQ lists what trades there: "Ordinary
// Shares (Voting and Non - Voting) Preference Shares ...". The FAQ gives
// the fee ("Transactions up to Rs. 100 Million - 1.12%", brokerage
// 0.640 %). The only online limit it names is size: "Can odd lots be
// traded on the online trading system? No" (under 100 shares). That is an
// order-size remark, not a removal. The catalogue is the whole Colombo
// share book.
//
//   https://www.ndbs.lk/pages/faq.jsp   (fees, odd lots)
//   https://www.ndbs.lk/dwnlds/invest_with_us/2021/Internet_Trading_Agreement_NDBS.pdf
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
//   node brokers/ndb/ndb_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { cseBook, cseHalted } from "../asialk/cseBook.mjs";

const OUTPUT = new URL("ndb-parsed.json", import.meta.url);

const rows = await cseBook();
if (rows.length < 250) throw new Error(`only ${rows.length} Colombo shares came back`);
if (rows.some((row) => !/\.(N|X|P)\d{4}$/.test(row.ticker))) throw new Error("a line that is not a share stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const halted = Object.keys(await cseHalted());
const withIsin = stamped.filter((row) => row.isin).length;
console.error(`${stamped.length} listings, ${withIsin} with an ISIN; ${halted.length} suspended left out: ${halted.join(", ")}`);
