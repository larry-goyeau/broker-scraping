// What BABA Equities sells in shares and ETFs, with no login. Its online
// self-trading account trades the Pakistan Stock Exchange ready market; the
// PSX page says it gives clients "the sale and purchase of all shares of
// companies listed on the Pakistan Stock Exchange". The Pakistan Stock
// Exchange is the only place (PMEX commodities and currency futures: out).
//
//   https://bel.com.pk/psx-page/
//   https://bel.com.pk/stock-trading/
//
// BABA publishes no symbol list and names no board, segment or ETF it does
// not trade, so the catalogue is the exchange's whole book: the PSX
// regular deliverable market (REG), read by brokers/nextcapital/psxBook.mjs
// (sources and filters there):
//
//   https://dps.psx.com.pk/eligible-scrips
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
// Kept: shares, preference shares, modarabas, REITs and the PSX ETFs, in
// rupees on XKAR.
// Left out (psxBook): rights, closed-end funds, debt lines, and companies
// the exchange prints as delisted or suspended or that have not traded
// for six months (psxStatus.mjs). Nothing else: the Shariah page only
// links a list of Shariah-compliant shares for clients who want them.
// Remarks, not removals: GEM Board lines (accredited investors only) and
// lines on the non-compliant counter, as psxBook sets them.
//
// Fee page ("Online Self Trading" commission structure, read on
// 2026-10-25): share price up to 20 "0.03 Pasia Per Share", 20.01 and
// above "0.15% of the Transaction Value"; levies billed at actual.
//
//   https://bel.com.pk/wp-content/uploads/2025/03/BABA-Equities-Pvt.-Ltd-Commission-Slab-ST.pdf
//
//   node brokers/babaequities/babaequities_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("babaequities-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`BABA Equities: ${psxBookSummary(rows)}`);
