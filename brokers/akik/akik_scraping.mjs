// What Akik Capital (akikcapital.com) sells in shares and ETFs, with no
// login. Akik is a Pakistan Stock Exchange broker; its clients trade online
// through Vtrade (desktop, web, Android and iOS). Its commission: "3 Paisa
// or 0.15% of the Share Price (whichever is higher) (As per Pakistan stock
// exchange notice number PSX/N-1258)". The Pakistan Stock Exchange is its
// only place, so the catalogue is the exchange's whole ready-market book:
// the PSX regular deliverable list (REG.xml), read by
// brokers/nextcapital/psxBook.mjs.
//
//   https://akikcapital.com/uploads/files/Commission_Structure.pdf   (fees)
//   https://akikcapital.com/page-online-trading
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
//
//   node brokers/akik/akik_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("akik-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(psxBookSummary(rows));
