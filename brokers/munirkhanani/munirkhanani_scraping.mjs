// What Muhammad Munir Muhammad Ahmed Khanani Securities (munirkhanani.com)
// sells in shares and ETFs, with no login. It is a Pakistan Stock Exchange
// broker whose clients trade online through Trade Cast; its tariff is the
// "Commission Slab as prescribed by PSX" (a flat amount per share up to a
// price of Rs 20, "0.15%" above). The Pakistan Stock Exchange is its only
// place, so the catalogue is the exchange's whole ready-market book: the PSX
// regular deliverable list (REG.xml), read by
// brokers/nextcapital/psxBook.mjs.
//
//   https://munirkhanani.com/wp-content/uploads/2024/09/commission-slab-mmk.pdf   (fees)
//   https://munirkhanani.com/wp-content/uploads/2022/02/trade-cast-user-guide.pdf
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
//   node brokers/munirkhanani/munirkhanani_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("munirkhanani-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(psxBookSummary(rows));
