// What Topline Securities sells in shares and ETFs, with no login. Its
// accounts (individual, Sahulat, Islamic) trade the Pakistan Stock Exchange
// ready market online through the Vtrade terminal and app ("Online
// Trading", "Vtrade User Manual", "Risk Associated with Online Trading").
// The Pakistan Stock Exchange is the only place (commodities: out).
//
//   https://topline.com.pk/page-trade-with-topline
//   https://topline.com.pk/page-online-trading
//
// Topline publishes no symbol list and names no board, segment or ETF it
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
// Fees: the individual account opening form (CRF / KYC) prints a "Minimum
// Commission Structure": share price "Up to 20.00" 3p, "From 20.1 and
// above" 0.15%; NCCPL, CGT and Sindh Sales Tax at actual.
//
//   https://topline.com.pk/uploads/files/CRF___KYC_(INDIVIDUAL).pdf
//
//   node brokers/topline/topline_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("topline-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Topline Securities: ${psxBookSummary(rows)}`);
