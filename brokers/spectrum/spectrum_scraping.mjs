// What Spectrum Securities (spectrumonline.com.pk) sells in shares and ETFs,
// with no login. Spectrum is a "TREC Holder: Pakistan Stock Exchange"; its
// online platform Vtrade gives access to the exchange, and its brochure
// lists "Ready & Future Markets Executions". Its online-trading tariff: basic
// package "From Rs .01 To Rs 20 The Commission Will Be Charge .03 Paisa,
// From Rs 20.01 To Onward Commission Will Be Charge .15% of Rate"; premium
// package "0.15% of value or 7 paisa per share whichever is greater". The
// Pakistan Stock Exchange is its only place, so the catalogue is the
// exchange's whole ready-market book: the PSX regular deliverable list
// (REG.xml), read by brokers/nextcapital/psxBook.mjs.
//
//   https://www.spectrumonline.com.pk/commstr.php   (fees)
//   https://www.spectrumonline.com.pk/otrading.php
//   https://www.spectrumonline.com.pk/downloads/spectrum-brochure.pdf
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
// The brochure says "Spectrum Securities doesn't offers physical share
// trading": that concerns paper certificates, not listed lines, so it
// removes nothing. Its Islamic window ("Shariah Compliance symbols list
// (Islamic Window)") is an account the client chooses, so it removes
// nothing either.
//
//   node brokers/spectrum/spectrum_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("spectrum-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(psxBookSummary(rows));
