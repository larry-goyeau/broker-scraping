// What KBZ Stirling Coleman Securities (KBZSC) sells, with no login. It is a
// Yangon Stock Exchange (YSX) member and its only place is the YSX: its fee
// page gives "our Fees and Commission for trades executed on YSX", and its
// trading page says "All trading matters are governed by rules and
// regulations of the Yangon Stock Exchange". The account is "Cash trading",
// funded in "Myanmar Kyats".
//
//   http://www.kbzsc.com/securities-trading/how-trade
//   http://www.kbzsc.com/securities-trading/services-offered
//   http://www.kbzsc.com/faqs
//
// KBZSC names no board, segment or share it does not handle. Its "Recent
// IPOs" page lists only seven Main Board shares (FMI to AMATA), but it is a
// list of past offers, not a trading list, and it stops in 2021 (it misses
// MAEX, listed later). So the list kept is the whole YSX book: the Main
// Board and the Pre-Listing Board, read by the shared ysxBook.mjs from the
// exchange's own company lists, minus delisted, deregistered and unquoted
// (halted) lines. The YSX lists no ETF, ETN, ETC or foreign share.
//
//   http://www.kbzsc.com/securities-trading/recent-ipos
//   https://ysx-mm.com/main-board/listing/company/
//   https://ysx-mm.com/pre-listing-board/registered-companies/company-list/
//
// Remarks, not removals: KBZSC asks for a Myanmar NRC to open an account and
// to trade, and the YSX may suspend foreign buy orders on a share (written
// into raw). An order is capped at 9,999 shares online.
//
// Every YSX share is quoted in kyat (MMK). The YSX gives a five-digit
// company code, not an ISIN; the ISIN comes from assets/stocks.csv.
//
// Fees (commission bands, image on the page; stamp duty 0.1% on buys):
//   http://www.kbzsc.com/securities-trading/fees-and-commissions
//
//   node brokers/kbzstirlingcolem/kbzstirlingcolem_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ysxBook } from "./ysxBook.mjs";
import fs from "node:fs";

const rows = await ysxBook({ boards: ["Main Board", "Pre-Listing Board"] });

for (const ticker of ["FMI", "MTSH", "MCB", "FPB", "TMH", "EFR", "AMATA"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);
}
if (rows.length < 9) throw new Error(`only ${rows.length} YSX lines`);

fs.writeFileSync(new URL("kbzstirlingcolem-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.raw.split(" | ")[0]} ${row.type}`] = (counts[`${row.raw.split(" | ")[0]} ${row.type}`] || 0) + 1;
console.error(`${rows.length} listings`, counts);
