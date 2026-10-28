// What Chiyu Banking Corporation (集友銀行, Hong Kong) sells in shares and
// ETFs, with no login. Its securities trading page: "一個證券賬戶，同時買賣港股
// 及中國A股" (one securities account for Hong Kong shares and China
// A-shares), orders "直達香港交易所AMS/3系統", through internet banking,
// mobile banking, the automated stock hotline, a manned hotline and
// branches; A-shares through "滬港通、深港通".
//   https://www.chiyubank.com/cyb/index/tzlc/zq/zqmmfw/index.shtml
// Its general banking fee schedule (section 3, Securities Services) prices
// HKEx-listed stocks ("Trading through automated trading channels (Mobile
// Banking / Internet Banking / Automated Stock Trading Hotline)": 0.18% to
// 0.25% by Securities Club tier, min HKD100 / RMB100), A shares (Shanghai /
// Shenzhen) on the same tiers (min RMB100, with ETF rates for the handling,
// management and transfer fees), and "Singapore Securities - 1. Jardine
// Group Stocks and other bonus issue 2. Non Jardine Group Stocks" ("1% of
// the transaction amount per trade (Non Jardine Group)", min SGD250; Jardine
// group 0.50%, min USD20).
//   https://www.chiyubank.com/cyb/attachDir/deposit_general_banking_services_tw.pdf
// No page lists titles or states how many there are.
//
// Hong Kong: the whole exchange (../primehk/hkexBook.mjs): HKEX's List of
// Securities (Equity, REITs, Exchange Traded Products), less the lines its
// latest daily quotations show suspended, never traded or not quoted, and
// the temporary counters; HKD, USD and RMB (CNH) counters keep their own
// code and currency (fees are "charged according to the transaction
// currency", HKD and RMB). Warrants and CBBCs are not shares or ETFs.
// China A-shares: HKEX's Northbound buy-and-sell lists, A-shares and ETFs
// (../welllink/connectBook.mjs), less the suspended lines. ChiNext and STAR
// shares stay with a remark: Northbound they are for institutional
// professional investors only (HKEX's rule, the broker-list restriction).
// Singapore is left out: Chiyu prices Singapore securities, but the
// schedule gives them no online channel (the automated-channel rates are
// for HKEx-listed stocks and A shares), and only what can be bought online
// is kept (owner, 2026-10-25). ./sgxBook.mjs, SGX's whole listing, stays
// for another broker.
//
//   node brokers/chiyu/chiyu_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../capitolcredituni/unifimoneyBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import { connectBook, connectRemark } from "../welllink/connectBook.mjs";
import fs from "node:fs";

const FOLDER = "chiyu";

await evidence("https://www.chiyubank.com/cyb/index/tzlc/zq/zqmmfw/index.shtml", [/一個證券賬戶，同時買賣港股及中國A股/, /滬港通、深港通/]);

const hk = await hkexBook();
const connect = await connectBook();

const connectRows = connect.rows.map(({ turnover, board, ...row }) => (board ? { ...row, remark: connectRemark(board) } : row));
const kept = stampRows(withoutObligations([...hk.rows, ...connectRows]));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});
console.error(
  `${FOLDER}: ${kept.length} rows ${JSON.stringify(tally(kept, (row) => `${row.mic} ${row.type}`))}; ISIN ${kept.filter((row) => row.isin).length}; ` +
    `HKEX list ${hk.listDate}, quotations ${hk.quoteDate}, dropped ${hk.dropped.length}; ` +
    `Connect lists ${JSON.stringify(connect.listDates)}, Sina ${connect.quoteDay}, dropped ${connect.dropped.length}`
);
