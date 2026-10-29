// What Vector Securities sells in shares and ETFs, with no login. "We
// provide online and dealer-assisted services to enable our clients manage
// their investments"; its equity account (eClear
// Standard) trades the Pakistan Stock Exchange through its web terminal and
// app. The Pakistan Stock Exchange is the only place for shares and ETFs
// (PMEX commodities, mutual funds and placements: out).
//
//   https://vector.com.pk/
//
// Vector publishes no symbol list and names no board, segment or ETF it
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
// Fees: the individual account form, "Commission Slab & Trade Charges ...
// applicable on your equity trading": price 0.01 and above "5p or 0.15% of
// Value whichever is higher"; daily future rollover 1p or 0.03%; SST 15%.
//
//   https://vector.com.pk/wp-content/uploads/2025/10/AOF-INDIVIDUAL-ECLEAR-STANDARD-Single.pdf
//
//   node brokers/vectorsec/vectorsec_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("vectorsec-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Vector Securities: ${psxBookSummary(rows)}`);
