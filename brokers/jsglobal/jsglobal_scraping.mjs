// What JS Global Capital sells in shares and ETFs, with no login. Its
// "Equity Brokerage" service ("Trade stocks on Pakistan Stock Exchange with
// competitive rates and advanced trading tools", features "Online
// Trading") trades the Pakistan Stock Exchange ready market through its
// online trading interface and app. The Pakistan Stock Exchange is the only
// place (PMEX commodities: out).
//
//   https://jsglobalonline.com/   (a single-page site; the text is in its script bundle)
//
// JS Global publishes no symbol list and names no board, segment or ETF it
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
// Fees: the site's "Commission Structure – Equity" link, the "JS Global
// Capital Limited Commission Sheet": "Commission for Regular Trades 3 Paisa
// per share or 0.15% of the traded Value, whichever is higher". The link
// answered 404 on 2026-10-28; the Wayback Machine holds the same file
// (snapshot 2026-05-13).
//
//   https://jsglobalonline.com/wp-content/uploads/2024/12/JS-Global-Commission-Slab.pdf
//   http://web.archive.org/web/20260513041822/https://jsglobalonline.com/wp-content/uploads/2024/12/JS-Global-Commission-Slab.pdf
//
//   node brokers/jsglobal/jsglobal_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("jsglobal-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`JS Global Capital: ${psxBookSummary(rows)}`);
