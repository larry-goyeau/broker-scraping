// What First National Equities (FNEL) sells in shares and ETFs, with no
// login. fnetrade.com is its "Online Trading Platform" ("Online Trading in
// PSX"; desktop Vtrade terminal and iOS/Android app). The Pakistan Stock
// Exchange is the only place.
//
//   https://fnetrade.com/Home
//
// FNEL publishes no symbol list and names no board, segment or ETF it does
// not trade, so the catalogue is the exchange's whole book: the PSX regular
// deliverable market (REG),
// read by brokers/nextcapital/psxBook.mjs (sources and filters there):
//
//   https://dps.psx.com.pk/eligible-scrips
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
// Kept: shares, preference shares, modarabas, REITs and the PSX ETFs, in
// rupees on XKAR.
// Left out (psxBook): rights, closed-end funds, debt lines, and companies
// the exchange prints as delisted or suspended or that have not traded
// for six months (psxStatus.mjs).
// Remarks, not removals: GEM Board lines (accredited investors only) and
// lines on the non-compliant counter, as psxBook sets them.
//
// Fees: "Commission Slab-1" (scanned, read by OCR), the same for trading
// and delivery, a share: 0.01-5.00 Rs 0.03, 5.01-20.00 0.05, 20.01-50.00
// 0.10, 50.01-60.00 0.20, 60.01-70.00 0.25, 70.01-80.00 0.30, 80.01-90.00
// 0.40, 90.01-100.00 0.50, 100.01 onward 0.55% of value; "Day Trade is
// charged on one side of the transaction".
//
//   https://fnetrade.com/downloads/account/Commission%20Slab.pdf
//   https://fnetrade.com/Trading/commissionStructure
//
//   node brokers/firstnational/firstnational_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("firstnational-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`First National Equities: ${psxBookSummary(rows)}`);
