// What JMMB (Jamaica) sells in shares, with no login. JMMB has no product
// list. Its brokerage arm, JMMB Securities Limited, is a member dealer of
// the Jamaica Stock Exchange, and JMMB says "we are the largest retail
// stock brokerage in Jamaica": clients buy and sell through the JMMB EMMA
// account, online on Moneyline or in branch. The 2026 fee schedule prices
// both channels under EQUITIES: "JMMB SL Commission - Assisted Channels**
// 2.00% ... minimum JA$100.00" and "Digital Channels* 0.70%" (Moneyline).
// So the book is the JSE's equity markets: the Main Market and the Junior
// Market in JMD, and the USD Market. JMMB's pages name no market, board or
// security type it leaves out; its "Stock Snapshot" research list (not a
// restriction) itself covers USD Market lines (FIRSTROCKUSD, MPCCELUS,
// SILUS, TJHUSD) and the two Sagicor Select index funds (SELECTF,
// SELECTMD), which the shared module types ETF. The EMMA account opens
// "with as little as J$25,000 or US$200", so both currencies are held.
// JMMB's Trinidad and Dominican Republic arms trade other exchanges and
// are not this place.
//
// The reading of the JSE pages (listed lines, kept only when on the day's
// price board and not suspended; bond markets not read; one row per
// currency for a company quoted in JMD and USD) is in jamaicaBook.mjs.
//
//   https://jm.jmmb.com/ja-equities
//   https://jm.jmmb.com/investment-jamaica-products   (#stocks)
//   https://jm.jmmb.com/sites/default/files/Jamaica/Attachments/Fees/2026/JMMB-investments_Fees_2026.pdf
//   https://www.jamstockex.com/listings/listed-companies/?market=31   (22 Junior, 49 USD)
//   https://www.jamstockex.com/trading/trade-quotes/?market=31        (22, 49)
//
//   node brokers/jmmb/jmmb_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { jamaicaBook } from "./jamaicaBook.mjs";
import fs from "node:fs";

const rows = await jamaicaBook();
const written = stampRows(withoutObligations(rows));
if (written.length !== rows.length) throw new Error(`the bond filter dropped ${rows.length - written.length} shares`);
fs.writeFileSync(new URL("jmmb-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows written to jmmb-parsed.json`);
