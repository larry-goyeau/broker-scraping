// What MRA Securities sells in shares and ETFs, with no login. Its online
// platforms (MRA D-Trade, V Trade, and MRA Wiqaya for Shariah clients)
// trade the Pakistan Stock Exchange ready market: "online equity trading
// across KSE-100, KMI-30, and All-Share indices"; the services list
// includes "Trade in ETF". The Pakistan Stock Exchange is the only place
// (PMEX commodities: "Coming Soon").
//
//   https://mra.com.pk/services
//   https://mra.com.pk/trading-apps
//
// MRA publishes no symbol list and names no board, segment or ETF it does
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
// for six months (psxStatus.mjs). Nothing else. The Wiqaya platform is the
// client's Shariah choice; it does not narrow D-Trade.
// Remarks, not removals: GEM Board lines (accredited investors only) and
// lines on the non-compliant counter, as psxBook sets them.
//
// Fee page ("Client's Commission Structure", MRA, D-Trade and Wiqaya, read
// on 2026-10-25): ready delivery (DEL), price 0.01 - 20.00 "0.0300 R" a
// share, 20.01 and above "0.1500 %"; "Rs. 0.03 or 0.15% or agreed rate
// which is higher with maximum cap of 2.5%".
//
//   https://mra.com.pk/downloads/Commission-Structure.pdf
//
//   node brokers/mra/mra_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("mra-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`MRA Securities: ${psxBookSummary(rows)}`);
