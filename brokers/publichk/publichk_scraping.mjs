// What Public Bank (Hong Kong) sells online, with no login: every share,
// REIT and exchange-traded product on the Stock Exchange of Hong Kong.
// Its securities page offers "Internet Securities Trading, Stock Trading
// App" and the app lists "Hong Kong stock trading". The tariff ("Service
// Charges on Investment Services", 00078_13E, August 2025) prices "Local
// securities" by internet, mobile and telephone; its "Foreign securities"
// line has no rate ("Rate/Fee varies from market to market ... contact
// our Customer Hotline"), so only Hong Kong is a place here. No page names
// a board, segment or product that is not traded, so GEM and the ETFs stay
// in (owner rule: the whole place unless the broker names an exception).
//
// The list is the exchange's (../primehk/hkexBook.mjs): HKEX's List of
// Securities (Equity, REITs, Exchange Traded Products), less the lines its
// latest daily quotations show suspended, never traded or not quoted, and
// less HKEX's temporary board-lot counters. Debt securities, derivative
// warrants, callable bull/bear contracts and equity warrants stay out. One
// row per stock code; the USD and RMB (CNH) counters are their own codes
// and keep their trading currency. The tariff charges a "Multi-Counter
// Transfer Instruction" and no page refuses the USD or RMB counters, so
// they stay.
//
// Client-dependent, so a remark and not a removal: the 29 Leveraged and
// Inverse products (raw "Leveraged and Inverse") need an SFC
// derivatives-knowledge assessment before a client may buy them; the
// tariff charges "Overseas Customers" 0.5% (min HK$100) instead of the
// 0.2% (min HK$68) online rate of Hong Kong customers (a cost-file matter).
//
//   https://www.publicbank.com.hk/en/retailbanking/investment/securitiestrading
//   https://www.publicbank.com.hk/en/retailbanking/investment/Investment_StocksTradingApp
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/dYYMMDDe.htm
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_GYYMMDD.htm
//
// Fees: https://www.publicbank.com.hk/static/prod/retailBanking-investment-securitiesTrading/00078_13EN.pdf
//
//   node brokers/publichk/publichk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import fs from "node:fs";

const FOLDER = "publichk";
const { rows, dropped, halted, reopening, quiet, outOfScope, listDate, quoteDate } = await hkexBook();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});
console.error(
  `${FOLDER}: ${kept.length} rows, HKEX list as at ${listDate}, quotations ${quoteDate}; ` +
    `by type ${JSON.stringify(tally(kept, (row) => row.type))}, by currency ${JSON.stringify(tally(kept, (row) => row.currency))}; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; ` +
    `dropped ${dropped.length} ${JSON.stringify(tally(dropped, (item) => item.reason.replace(/ \(main counter.*\)$/, "").replace(/ from .*$/, "")))}; ` +
    `halted (kept) ${halted.join(", ") || "none"}; reopening (kept) ${reopening.length}; no trade that day (kept) ${quiet}; ` +
    `out of scope ${JSON.stringify(outOfScope)}`
);
