// What Adam Securities sells in shares and ETFs, with no login. Its online
// account trades the Pakistan Stock Exchange ready market through the
// Vtrade application ("online trading of equities and derivative through
// its web portal"). The Pakistan Stock Exchange is the only place (PMEX
// commodities: out).
//
//   https://adamsecurities.com.pk/page-online-trading
//   https://adamsecurities.com.pk/page-services
//
// Adam publishes no symbol list and names no board, segment or ETF it does
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
// for six months (psxStatus.mjs). Nothing else: Adam's pages exclude no
// board, ETF or segment.
// Remarks, not removals: GEM Board lines (accredited investors only) and
// lines on the non-compliant counter, as psxBook sets them.
//
// Fee page: the site's "Fee & Commission" and "Commission Slabs" links
// open the PSX notice PSX/N-1258 (9 October 2019), the exchange's standard
// range of brokerage commission: ready market "3p or 0.15% whichever is
// higher", and "up to 2.5% of the transaction value". A range is a
// published tariff (owner rule; the cost file takes the maximum).
//
//   https://adamsecurities.com.pk/uploads/files/Commission_Slabs.pdf
//
//   node brokers/adam/adam_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("adam-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Adam Securities: ${psxBookSummary(rows)}`);
