// What ASA Securities (富國證券, Hong Kong) sells, with no login: every
// share, REIT and exchange-traded product on the Stock Exchange of Hong
// Kong, its only place. Its business page describes securities trading on
// HKEX ("香港交易所 ... 中央證券市場"); its fee page prices one Hong Kong
// tariff (佣金 0.25%, 最低港幣100元, with the SFC, AFRC and HKEX levies and
// stamp duty) and its trading policy page (香港證券交易政策) only forbids
// short selling ("客戶不能進行任何沽空交易"). No page names a board,
// segment or product that is not traded, so GEM and the ETFs stay in
// (owner rule: the whole place unless the broker names an exception).
//
// The list is the exchange's (../primehk/hkexBook.mjs): HKEX's List of
// Securities (Equity, REITs, Exchange Traded Products), less the lines its
// latest daily quotations show suspended, never traded or not quoted, and
// less HKEX's temporary board-lot counters. Debt securities, derivative
// warrants, callable bull/bear contracts and equity warrants stay out. One
// row per stock code; the USD and RMB (CNH) counters are their own codes
// and keep their trading currency. No page refuses the USD or RMB
// counters, so they stay.
//
// Client-dependent, so a remark and not a removal: the 29 Leveraged and
// Inverse products (raw "Leveraged and Inverse") need an SFC
// derivatives-knowledge assessment before a client may buy them.
//
//   https://asasec.com/tc/business.php
//   https://asasec.com/tc/securities_trading_policy.php
//   https://asasec.com/tc/trading_help_securities.php
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/dYYMMDDe.htm
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_GYYMMDD.htm
//
// Fees: https://asasec.com/tc/securities_fee_and_commision.php
//
//   node brokers/asa/asa_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import fs from "node:fs";

const FOLDER = "asa";
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
