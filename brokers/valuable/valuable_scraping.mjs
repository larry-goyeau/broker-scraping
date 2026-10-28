// What Valuable Capital (華盛証券, Hong Kong; the Vbkr / 華盛通 app) sells in
// shares and ETFs, with no login. Its home page names three share markets:
// "港股 股票、ETF、牛熊窩輪" (Hong Kong shares, ETFs, CBBCs and warrants),
// "美股 股票、期權、ETF" (US shares, options, ETFs) and "A股 跨市場交易" (A-shares,
// through Stock Connect). Each has a public fee page, online and by phone:
//   "港股買賣交易收費（股票、ETF、界內證、窩輪牛熊）": online "可低至訂單交易金額
//   的0.03%，最低收費為3港元", platform fee HK$15 an order.
//   "美股買賣交易收費（股票、ETF、期權）": online "可低至0.0049美元/股，最低收費
//   為0.99美元/筆", platform fee US$0.005 a share (min US$1).
//   "A股通買賣交易收費" and "A股通ETF買賣交易收費": online 0.03%, min RMB3,
//   platform fee RMB15 an order.
//   https://www.vbkr.com/
//   https://www.valuable.com.hk/help/topic2-hong-kong-stock-trading-fees
//   https://www.valuable.com.hk/help/topic2-us-stock-trading-fees
//   https://www.valuable.com.hk/help/topic2-a-share-connect-fees-of-vbrokers-a-share-connect
// No page lists the titles, states how many there are, names a US venue or
// an excluded product; no page offers OTC (no OTC fee either).
//
// Hong Kong: the whole exchange (../primehk/hkexBook.mjs): HKEX's List of
// Securities (Equity, REITs, Exchange Traded Products), less the lines its
// latest daily quotations show suspended, never traded or not quoted, and
// the temporary counters; HKD, USD and RMB (CNH) counters each keep their
// own code and currency ("支持多幣種投資交易"). Warrants, CBBCs and inline
// warrants are not shares or ETFs.
// China A-shares: HKEX's Northbound buy-and-sell lists, A-shares and ETFs
// (../welllink/connectBook.mjs), less the suspended lines. ChiNext and STAR
// shares stay with a remark: Northbound they are for institutional
// professional investors only (HKEX's rule, the broker-list restriction).
// United States: no list, so the whole US exchange book of the day
// (../wellstrade/usBook.mjs: one NBBO market, one row a title on its
// primary listing; warrants, rights, units, listed notes and halted lines
// out; OTC lines are not in it).
//
//   node brokers/valuable/valuable_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../capitolcredituni/unifimoneyBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { connectBook, connectRemark } from "../welllink/connectBook.mjs";
import fs from "node:fs";

const FOLDER = "valuable";

await evidence("https://www.vbkr.com/", [/港股\s*股票、ETF、牛熊窩輪/, /美股\s*股票、期權、ETF/, /A股\s*跨市場交易/]);
await evidence("https://www.valuable.com.hk/help/topic2-hong-kong-stock-trading-fees", [/港股買賣交易收費（股票、ETF、界內證、窩輪牛熊）/]);
await evidence("https://www.valuable.com.hk/help/topic2-us-stock-trading-fees", [/美股買賣交易收費（股票、ETF、期權）/]);
await evidence("https://www.valuable.com.hk/help/topic2-a-share-connect-fees-of-vbrokers-a-share-connect", [/A股通買賣交易收費/, /A股通ETF買賣交易收費/]);

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
