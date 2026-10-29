// What Trust Securities and Brokerage (TSBL) sells in shares and ETFs, with
// no login. Its accounts trade the Pakistan Stock Exchange ready market
// through the TSBL trading terminal and mobile app ("Download our
// cutting-edge Trading Terminal ... a seamless execution of your orders";
// "Mobile Trading"). The Pakistan Stock Exchange is the only place (PMEX
// commodities: out).
//
//   https://www.tsbl.com.pk/new/index.php
//   https://www.tsbl.com.pk/new/DownloadableData/UserManual.pdf
//
// TSBL publishes no symbol list and names no board, segment or ETF it does
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
// Fees: investors' awareness page, "STANDARD RANGE OF COMMISSION": "Basic
// Account Commission Structure 3 Paisa per share or 0.15% of the traded
// value, whichever is higher."
//
//   https://www.tsbl.com.pk/new/investors-awareness.php
//
//   node brokers/trustsecurities/trustsecurities_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("trustsecurities-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Trust Securities and Brokerage: ${psxBookSummary(rows)}`);
