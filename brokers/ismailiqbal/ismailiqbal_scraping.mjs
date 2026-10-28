// What Ismail Iqbal Securities (ismailiqbal.com) sells in shares and ETFs,
// with no login. It is a Pakistan Stock Exchange broker whose software and
// smartphone app let clients "buy and sell stocks"; its commission is "Rs
// 0.03 per share or 0.15% of the transaction value, whichever is higher".
// The Pakistan Stock Exchange is its only place, so the catalogue is the
// exchange's whole ready-market book: the PSX regular deliverable list
// (REG.xml), read by brokers/nextcapital/psxBook.mjs.
//
//   https://ismailiqbal.com/Commission_Charges.php   (fees)
//   https://ismailiqbal.com/eqsales.php
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
// Nothing is removed from the book: the broker names no board, segment or
// type of line it does not sell. Left out by psxBook.mjs, as for every PSX
// broker: rights, closed-end funds, debt lines, and companies the exchange
// prints as delisted or suspended or that have not traded for six months
// (psxStatus.mjs). Kept with a remark: GEM Board lines (accredited investors
// only) and companies on the non-compliant counter. Every line is in rupees
// on the Pakistan Stock Exchange (XKAR); ISINs come from the shared lists
// and brokers/standardcapital/psxIsins.mjs.
// Its "Islamic Brokerage Window" is an account the client chooses, so it
// removes nothing here.
//
//   node brokers/ismailiqbal/ismailiqbal_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("ismailiqbal-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(psxBookSummary(rows));
