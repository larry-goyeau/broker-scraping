// What Destek Yatırım sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, its only place. Its equity-market page describes
// what trades on Pay Piyasası, exchange-traded funds included ("payları,
// yeni pay alma hakları, borsa yatırım fonları, varantlar ..."), and its
// tariff prices the whole market at one rate ("Pay Piyasası ... İşlem
// hacmi üzerinden azami binde 2"). Clients trade through its internet
// branch. No page names a board, segment or fund it does
// not serve, and it offers no foreign shares (products: Pay, VİOP, TEFAS
// funds; checked 2026-10-25).
//
// The list is the exchange's, from ../halkyatrm/bistBook.mjs: the share codes
// and exchange-traded funds KAP lists (../ziraat/bist.mjs, TradingView's
// names and ISINs, all in lira), checked against Borsa Istanbul's own
// end-of-day equity bulletin, which drops halted lines (UMPAS on the
// 2026-10-23 bulletin) and companies whose shares no longer trade. Warrants,
// rights, certificates, real-estate and venture-capital fund units and bonds
// stay out. İş Bankası's A and founders' shares (ISATR, ISKUR) are kept:
// open for orders, though they trade a few times a year.
//
//   https://www.destekyatirim.com/pay-hisse-senedi
//   https://www.destekyatirim.com/internet-sube
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.destekyatirim.com/storage/01KGS2W2TSBXTNE5SDJ2ZPQRJS.pdf
//
//   node brokers/destekyatrm/destekyatrm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("destekyatrm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `destekyatrm: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length}; not on TradingView ${missing.length} (${missing.join(" ") || "none"})`
);
