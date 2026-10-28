// What uSMART Securities (盈立證券, Hong Kong entity of the uSMART group;
// hk.usmartglobal.com, formerly usmart.hk) sells in shares and ETFs, with
// no login. Its product pages:
//   Hong Kong: "Hong Kong Stocks Includes blue-chip stocks, red chip
//   companies, and H Shares. Hong Kong ETFs Trade diverse ETFs: Virtual
//   Asset ETFs, Leveraged ETFs, Index ETFs, etc." ("Real-time Automatic
//   Currency Conversion via the App (Supports HKD, USD, CNY, SGD)").
//   A-shares: "uSMART provides extensive online A-share trading services
//   and real-time A-share streaming quotes, covering over 1,000 eligible
//   stocks under the Shanghai-Hong Kong Stock Connect and Shenzhen-Hong
//   Kong Stock Connect programs."
//   US: "US Stocks", "US ETFs" and "US OTC Access to over-the-counter
//   securities."
//   https://hk.usmartglobal.com/en/products/financial-investment/hk-stocks
//   https://hk.usmartglobal.com/en/products/financial-investment/a-shares
//   https://hk.usmartglobal.com/en/products/financial-investment/us-stocks
// Fees (uSMART Trading Fees): HK "Commission: 0.03% of transaction amount
// ... Platform Fee: HK$12/transaction"; A-shares "APP Trade: 0.02% of
// transaction amount (Minimum RMB5)", platform fee RMB12; US $0 commission,
// platform fee US$0.99 an order; "Fees for US OTC Stocks Commission: $0
// Platform Fee: $0.019 USD per share, minimum $6 USD per order".
//   https://hk.usmartglobal.com/en/charges
// No page lists the titles of any market, names an OTC tier or an excluded
// product, or names a US venue (help centre read through, 2026-10-25).
//
// Hong Kong: the whole exchange (../primehk/hkexBook.mjs): HKEX's List of
// Securities (Equity, REITs, Exchange Traded Products), less the lines its
// latest daily quotations show suspended, never traded or not quoted, and
// the temporary counters; HKD, USD and RMB (CNH) counters each keep their
// own code and currency. Warrants, CBBCs and inline warrants are not shares
// or ETFs.
// A-shares: HKEX's Northbound buy-and-sell lists (../welllink/connectBook.mjs),
// less the suspended lines. The page states a count, "over 1,000 eligible
// stocks", so (owner rule of 2026-10-25: a stated count keeps the N most
// popular titles of the place) the A-shares are cut to the 1,000 with the
// largest traded value of the latest session (Sina's 成交额). The count
// names stocks, so the Connect ETFs are not cut (owner rule: "all shares"
// keeps the ETFs). ChiNext and STAR shares kept stay with a remark:
// Northbound they are for institutional professional investors only.
// United States, exchange-listed: no list, so the whole US exchange book of
// the day (../wellstrade/usBook.mjs: one NBBO market, one row a title on its
// primary listing; warrants, rights, units, listed notes and halted lines
// out).
// United States, OTC: uSMART sells OTC online and publishes no list and no
// tier, so the whole OTC Markets listing of the four tiers with a public
// quote, OTCQX, OTCQB, OTCID and Pink Limited (../moomoous/otcBook.mjs,
// which says what it keeps and leaves out).
//
//   https://www.otcmarkets.com/research/stock-screener/api?market=1   OTCQX (10 OTCQB, 20 OTCID, 21 Pink Limited)
//
//   node brokers/usmarthk/usmarthk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../capitolcredituni/unifimoneyBook.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { connectBook, connectRemark, topShares } from "../welllink/connectBook.mjs";
import fs from "node:fs";

const FOLDER = "usmarthk";
const SITE = "https://hk.usmartglobal.com/en";
const A_SHARES = 1000;
await evidence(`${SITE}/products/financial-investment/a-shares`, [/covering over 1,000 eligible stocks under the Shanghai-Hong Kong Stock Connect and Shenzhen-Hong Kong Stock Connect/]);
await evidence(`${SITE}/products/financial-investment/us-stocks`, [/US OTC Access to over-the-counter securities/, /US ETFs/]);
await evidence(`${SITE}/products/financial-investment/hk-stocks`, [/Hong Kong ETFs Trade diverse ETFs/]);
await evidence(`${SITE}/charges`, [/Fees for US OTC Stocks/]);

const hk = await hkexBook();
const connect = await connectBook();
const us = await usBook();

const aShares = topShares(connect.rows, A_SHARES);
const connectRows = aShares.map(({ turnover, board, ...row }) => (board ? { ...row, remark: connectRemark(board) } : row));

const otc = await otcBook(us);
const otcRows = otc.rows;

const kept = stampRows(withoutObligations([...hk.rows, ...connectRows, ...us, ...otcRows]));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});
console.error(
  `${FOLDER}: ${kept.length} rows ${JSON.stringify(tally(kept, (row) => `${row.mic} ${row.type}`))}; ISIN ${kept.filter((row) => row.isin).length}; ` +
    `HKEX list ${hk.listDate}, quotations ${hk.quoteDate}; Connect lists ${JSON.stringify(connect.listDates)}, Sina ${connect.quoteDay}: ` +
    `${connect.rows.filter((row) => row.type === "STOCK").length} A-shares cut to ${A_SHARES}, ${connect.rows.filter((row) => row.type === "ETF").length} ETFs kept; ` +
    otc.summary
);
