// What Intermarket Securities sells in shares and ETFs, with no login. Its
// accounts "Trade PSX shares on Intermarket Securities' secure online
// trading platform" (desktop terminal and app). The Pakistan Stock Exchange
// is the only place.
//
//   https://imsecurities.com.pk/online-trading   (a single-page site; the text is in its script bundle)
//
// Intermarket publishes no symbol list and names no board, segment or ETF
// it does not trade, so the catalogue is the exchange's whole book: the PSX
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
// Fees: the investor FAQ, "How much is the brokerage commission?": "For
// shares worth between PKR 0 - 19.9999, 0.03 paisa per share commission
// will be charged. For shares worth more than equal to PKR 20, 0.15% of the
// traded value will be charged as commission." (0.03 paisa is the site's
// wording for Rs 0.03, the PSX minimum.)
//
//   https://imsecurities.com.pk/investors/faqs
//
//   node brokers/intermarket/intermarket_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("intermarket-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Intermarket Securities: ${psxBookSummary(rows)}`);
