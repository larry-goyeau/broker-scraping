// What Shajarpak Securities sells in shares and ETFs, with no login. Its
// clients "can invest and trade online in Pakistan stock exchange using our
// mobile app and other online trading Platforms" (user manual for online
// trading on the site). The Pakistan Stock Exchange is the only place.
//
//   http://www.shajarpaksecurities.com/
//   http://www.shajarpaksecurities.com/docs/USER_MANUAL_ONLINE_TRADING.pdf
//
// Shajarpak publishes no symbol list and names no board, segment or ETF it
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
// Fees: the individual client form (CRF) prints "SHAJARPAK SECURITIES
// (PVT.) LIMITED COMMISSION SLAB": price 0.0000-9.9999 Rs 0.07 a share,
// 10.0000-24.9999 0.10, 25.0000-49.9999 0.15, 50.0000 and above 0.15%;
// CVT 0.01% on buys, FED 16% on commission.
//
//   http://www.shajarpaksecurities.com/docs/CRF_Individual_Clients_FORM.pdf
//
//   node brokers/shajarpak/shajarpak_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("shajarpak-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Shajarpak Securities: ${psxBookSummary(rows)}`);
