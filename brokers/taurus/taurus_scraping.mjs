// What Taurus Securities sells in shares and ETFs, with no login. Its
// online trading site (Taurus Online Trade: "Online Trading", "Mobile
// Trading", "Desktop Trading") trades the Pakistan Stock Exchange ready
// market; its home page links "Equities" there. The Pakistan Stock Exchange
// is the only place (PMEX commodities: out).
//
//   https://www.taurusonlinetrade.com/page.php?page=3333&cat=3333&title=Online_Trading
//   http://taurus.com.pk/
//
// Taurus publishes no symbol list and names no board, segment or ETF it
// does not trade, so the catalogue is the exchange's whole book: the PSX
// regular deliverable market (REG),
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
// Fees: "Taurus Securities Limited Commission Schedule (Standard
// Range/Scale of Brokerage Commission ... as per PSX/N-1258)": Regular
// Market (delivery and square trades), 0.01 and above, 0.1500% or 0.0300
// a share; "The prescribed range is from 3 Paisa per share or 0.15% of the
// transaction value, whichever is higher, up to 2.5%" (scanned, read by
// OCR).
//
//   http://taurus.com.pk/wp-content/uploads/2021/05/Commissions.pdf
//
//   node brokers/taurus/taurus_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("taurus-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Taurus Securities: ${psxBookSummary(rows)}`);
