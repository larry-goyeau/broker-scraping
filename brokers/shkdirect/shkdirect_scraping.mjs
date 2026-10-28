// What SHK Direct (now EBSI Direct, Everbright Securities International's
// online brokerage, Hong Kong; ebshkdirect.com) sells in shares and ETFs,
// with no login. Its fee table prices three share markets, all online:
// "A. HK Shares and Warrants", "B. China Connect – Shenzhen & Shanghai A
// Shares" (A-shares and ETFs, e.g. "Handling Fee A Shares: 0.00341% ...
// ETFs: 0.004%") and "D. U.S. Shares (Traded via Online Platform)"
// (UStock Pro "0.138% per transaction (USD) (Min: USD 15)"); HK shares
// 0.138%, min HKD88; China Connect 0.138%, min RMB88.
//   https://www.ebshkdirect.com/en/info-fees
//   https://download.ebshk.com/fees/pricing-table-os-en.pdf
// The HK shares page: "HK shares are stocks listed on the Main Board or the
// Growth Enterprise Market (GEM) Board of Hong Kong Exchanges and Clearing
// Limited (HKEx)"; the fee page: "Each trade will be settled in the
// relevant stock’s trading currency designated by HKEX", so the USD and
// RMB counters stay. The US shares page: "The US stock market mainly
// includes the New York Stock Exchange and NASDAQ" ("mainly": no venue is
// cut, owner rule) and "We do not offer US share to all US persons and
// Canadian (both residents and non-residents)" (a client rule, for
// ../../accepted.mjs, not a catalogue cut). Its "almost 5,000 companies
// listed on the New York Stock Exchange and NASDAQ" is a WFE market count
// of March 2015, not the broker's offer, so it is not a count to cut to.
//   https://www.ebshkdirect.com/en/investment-HK+Shares
//   https://www.ebshkdirect.com/en/investment-US+Shares
// No page lists the titles of any market.
//
// Hong Kong: the whole exchange (../primehk/hkexBook.mjs): HKEX's List of
// Securities (Equity, REITs, Exchange Traded Products), less the lines its
// latest daily quotations show suspended, never traded or not quoted, and
// the temporary counters. Warrants and CBBCs are not shares or ETFs.
// China Connect: HKEX's Northbound buy-and-sell lists, A-shares and ETFs
// (../welllink/connectBook.mjs), less the suspended lines. ChiNext and
// STAR shares stay with a remark: Northbound they are for institutional
// professional investors only (HKEX's rule; the broker-list row says the
// same; no EBSI page names them).
// United States: no list, so the whole US exchange book of the day
// (../wellstrade/usBook.mjs: one NBBO market, one row a title on its
// primary listing; warrants, rights, units, listed notes and halted lines
// out; OTC lines are not in it). No page names an exception.
//
//   node brokers/shkdirect/shkdirect_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../capitolcredituni/unifimoneyBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { connectBook, connectRemark } from "../welllink/connectBook.mjs";
import fs from "node:fs";

const FOLDER = "shkdirect";

await evidence("https://www.ebshkdirect.com/en/info-fees", [
  /Each trade will be settled in the relevant stock.s trading currency designated by HKEX/,
  /UStock Pro General Transactions Charge/,
]);
await evidence("https://www.ebshkdirect.com/en/investment-US+Shares", [
  /The US stock market mainly includes the New York Stock Exchange and NASDAQ/,
  /We do not offer US share to all US persons and Canadian/,
]);

const hk = await hkexBook();
const connect = await connectBook();
const us = await usBook();

const connectRows = connect.rows.map(({ turnover, board, ...row }) => (board ? { ...row, remark: connectRemark(board) } : row));
const kept = stampRows(withoutObligations([...hk.rows, ...connectRows, ...us]));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});
console.error(
  `${FOLDER}: ${kept.length} rows ${JSON.stringify(tally(kept, (row) => `${row.mic} ${row.type}`))}; ISIN ${kept.filter((row) => row.isin).length}; ` +
    `HKEX list ${hk.listDate}, quotations ${hk.quoteDate}, dropped ${hk.dropped.length}; ` +
    `Connect lists ${JSON.stringify(connect.listDates)}, Sina ${connect.quoteDay}, dropped ${connect.dropped.length}; ` +
    `US directories ${JSON.stringify(us.report.directories)}`
);
