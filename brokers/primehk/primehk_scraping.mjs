// What Prime Securities Ltd (Hong Kong) sells, with no login: every share,
// REIT and exchange-traded product on the Stock Exchange of Hong Kong, its
// only place. The firm is an SEHK participant ("Participant of SEHK (broker
// no. 3220-3229)") and offers "Stock Trading (Phone Trading, Internet and
// mobile Trading)"; its fee page prices one stock trading tariff for
// "Orders placed via Internet / iPhone / Android App" and by phone, with
// the HK stamp duty, SFC levy and SEHK trading fee, and names no market,
// board or product that is not traded. The GoTrade manual's quote page
// shows HSI, GEM and the large-cap index, so GEM stays in. No page leaves
// ETFs out, so they stay too (owner rule: the whole place unless the broker
// names an exception).
//
// The list is the exchange's (./hkexBook.mjs): HKEX's List of Securities
// (Equity, REITs, Exchange Traded Products), less the lines its latest
// daily quotations show suspended, never traded or not quoted, and less
// HKEX's temporary board-lot counters. Debt securities, derivative
// warrants, callable bull/bear contracts and equity warrants stay out. One
// row per stock code; the USD and RMB (CNH) counters are their own codes
// and keep their trading currency. The fee page says "All amount in Hong
// Kong dollars" and does not say those counters are refused, so they stay.
//
// Client-dependent, so a remark and not a removal: the 29 Leveraged and
// Inverse products (raw "Leveraged and Inverse") need an SFC
// derivatives-knowledge assessment before a client may buy them.
//
//   http://www.primesec.com.hk/rev1/about-us.php?Lang=EN
//   http://www.primesec.com.hk/rev1/manuals/GoTrade_Manual_ENG%20v.1.5.0.pdf
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/dYYMMDDe.htm
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_GYYMMDD.htm
//
// Fees: http://www.primesec.com.hk/rev1/fee-structure.php?Lang=EN
//
//   node brokers/primehk/primehk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { hkexBook } from "./hkexBook.mjs";
import fs from "node:fs";

const FOLDER = "primehk";
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
