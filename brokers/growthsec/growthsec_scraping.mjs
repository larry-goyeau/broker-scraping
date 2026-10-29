// What Growth Securities sells in shares and ETFs, with no login. Its
// accounts ("Digital Account Opening", "Online Trading") trade the
// Pakistan Stock Exchange ready market online. The Pakistan Stock Exchange
// is the only place.
//
//   https://growthsecurities.com.pk/
//
// Growth publishes no symbol list and names no board, segment or ETF it
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
// Fees: the site's "Commission Structure" (CSLAB) link opens the PSX
// notice PSX/N-1258 (9 October 2019), the exchange's standard range of
// brokerage commission: ready market "3p or 0.15% whichever is higher",
// up to 2.5% of the transaction value. A range is a published tariff
// (owner rule; the cost file takes the maximum).
//
//   https://growthsecurities.com.pk/download/cslab.pdf
//
//   node brokers/growthsec/growthsec_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("growthsec-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Growth Securities: ${psxBookSummary(rows)}`);
