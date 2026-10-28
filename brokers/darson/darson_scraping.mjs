// What Darson Securities (darson.com.pk) sells in shares and ETFs, with no
// login. Darson is a "TREC Holder: Pakistan Stock Exchange Limited"; its
// online platform Vtrade trades the exchange's markets ("Market: REG / FUT
// /SIF") and its online-trading tariff charges "3 paisa per share or 0.15%
// of value, whichever is higher". The Pakistan Stock Exchange is its only
// place, so the catalogue is the exchange's whole ready-market book: the PSX
// regular deliverable list (REG.xml), read by
// brokers/nextcapital/psxBook.mjs.
//
//   https://www.darson.com.pk/DownloadableData/Commissionstructureonlinetrading.pdf   (fees)
//   https://www.darson.com.pk/DownloadableData/Vtrade_User_Manual.pdf
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
// Darson also runs a "Shariah Compliant Islamic Brokerage Window" (its own
// "AOF - Shariah" account forms): that is an account the client chooses, so
// it removes nothing here.
//
//   node brokers/darson/darson_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("darson-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(psxBookSummary(rows));
