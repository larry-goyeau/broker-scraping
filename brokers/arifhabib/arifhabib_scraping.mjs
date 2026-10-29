// What Arif Habib Limited sells in shares and ETFs, with no login. Its
// AHL eTrade accounts trade the Pakistan Stock Exchange ready market online
// (TradeCast terminal, web.ahletrade.com and the "AHL iTick" app; the FAQ:
// "whenever you will place order through online trading system"). The
// Pakistan Stock Exchange is the only place.
//
//   https://arifhabibltd.com/downloads/AHL-FAQS.pdf
//   https://forms.ahletrade.com/forms/
//
// Arif Habib publishes no symbol list and names no board, segment or ETF
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
// Fees: the Roshan Digital page answers "What are your commission
// charges?" with "Arif Habib Limited charges minimum commission as notified
// by PSX": the exchange's standard minimum, PSX/N-1258 (9 October 2019),
// ready market "3p or 0.15% whichever is higher". A regulated rate the
// broker states counts as a published tariff (owner rule).
//
//   https://arifhabibltd.com/roshan-digital
//
//   node brokers/arifhabib/arifhabib_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("arifhabib-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Arif Habib Limited: ${psxBookSummary(rows)}`);
