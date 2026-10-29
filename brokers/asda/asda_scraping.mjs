// What ASDA Securities sells in shares and ETFs, with no login. Its
// accounts trade the Pakistan Stock Exchange through the "Online Trading
// App" (desktop and mobile applications). The Pakistan Stock Exchange is
// the only place.
//
//   https://asdalive.com/
//   https://asdalive.com/online-trading-investor-protection
//
// ASDA publishes no symbol list and names no board, segment or ETF it does
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
// Fees: "Commission Structure One Account For All": share price Rs
// 0.01-10.0 0.03 a share; 10.01 and above "0.05 or 0.15% of Share Value
// Which ever is higher".
//
//   https://asdalive.com/downloads/commission-structure.pdf
//
//   node brokers/asda/asda_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("asda-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`ASDA Securities: ${psxBookSummary(rows)}`);
