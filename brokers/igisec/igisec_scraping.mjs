// What IGI Securities (IGI Finex Securities) sells in shares and ETFs, with
// no login. Its iTrade accounts trade the Pakistan Stock Exchange:
// "Customers have the freedom to trade in Shares (Ready and Futures)
// through Desktop, Mobile and Web-based trading platforms". The Pakistan
// Stock Exchange is the only place (PMEX commodities: out).
//
//   https://igisecurities.com.pk/ps-itrade.php
//   https://igisecurities.com.pk/ps-shares-trading.php
//
// IGI publishes no symbol list and names no board, segment or ETF it does
// not trade, so the catalogue is the exchange's whole book: the PSX regular
// deliverable market (REG), futures aside,
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
// Fees: "Silver Account (Without Trader Assistance)", the online-only
// account: rate up to Rs 1.20 "2.5% of transaction value"; Rs 1.21 and
// above "3 paisa per share and 0.15% of transaction value whichever is
// higher" (iTrade page). The Gold account (internet trading plus a trader)
// is 7.5 paisa (1.21-49.99), 10 paisa (50-99.99), 0.15% (100 and above),
// with the 0.15% floor (shares-trading page).
//
//   https://igisecurities.com.pk/ps-itrade.php
//
//   node brokers/igisec/igisec_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("igisec-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`IGI Securities: ${psxBookSummary(rows)}`);
