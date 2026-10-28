// What Banco Well Link (立橋銀行, Macau) sells, with no login: every share,
// REIT and exchange-traded product on the Stock Exchange of Hong Kong, its
// only place. Its securities service page: "投資品種豐富 港股、ETFs、港股IPO"
// (Hong Kong shares, ETFs and IPOs in one app). The fee schedule is for
// Hong Kong stocks only ("Fee Schedule (HK Stocks)", July 2026: online
// 0.028%, min HK$28; telephone only for odd-lot sells). No page names a
// board or segment that is not traded, so GEM stays in (owner rule: the
// whole place unless the broker names an exception). The sister broker
// Well Link Securities (wlsec.com) is a separate firm with its own offer;
// it is not this catalogue.
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
//   https://www.wlbank.com.mo/template/biztwocolorTemplate.html?id=267
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/dYYMMDDe.htm
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_GYYMMDD.htm
//
// Fees: https://www.wlbank.com.mo/webfile/upload/2026/07-10/17-17-290757397616718.pdf
//
//   node brokers/bancowelllink/bancowelllink_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import fs from "node:fs";

const FOLDER = "bancowelllink";
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
