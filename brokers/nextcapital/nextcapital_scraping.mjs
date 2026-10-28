// What Next Capital sells in shares and ETFs, with no login. Its retail
// account trades the Pakistan Stock Exchange ready market through the Next
// Advantage app and desktop terminal ("Retail Investing (PSX - PMEX)"; the
// FAQ: deposit funds "and use them to buy shares using our android, iOS or
// desktop applications"). PMEX is commodity futures: out. The Pakistan
// Stock Exchange is the only place.
//
//   https://nextcapital.com.pk/capability/retail-investing
//   https://nextcapital.com.pk/faq
//
// Next Capital publishes no symbol list and names no board, segment or
// product it does not trade, so the catalogue is the exchange's whole
// book: the PSX regular deliverable market (REG), read by psxBook.mjs
// (next to this script; sources and filters there):
//
//   https://dps.psx.com.pk/eligible-scrips
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
// Kept: shares, preference shares, modarabas, REITs and the PSX ETFs, in
// rupees on XKAR.
// Left out (psxBook): rights, closed-end funds, debt lines, and companies
// the exchange prints as delisted or suspended or that have not traded
// for six months (psxStatus.mjs). Nothing else: Next Capital's pages
// exclude no board, ETF or segment.
// Remarks, not removals: GEM Board lines (accredited investors only) and
// lines on the non-compliant counter, as psxBook sets them.
//
// Fee page (commission schedule, read on 2026-10-25): share price 0.01 to
// 12.00 "0.03 Paisa" a share, "12.01 & above" 0.25 %; CDC, NCCPL and taxes
// at actual.
//
//   https://cdn.prod.website-files.com/62135fdbd85a60c2f528095e/6864b9c264b141ab1d14fc99_Commission%20Structure%20-0725.pdf
//
//   node brokers/nextcapital/nextcapital_scraping.mjs

import { psxBook, psxBookSummary } from "./psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("nextcapital-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Next Capital: ${psxBookSummary(rows)}`);
