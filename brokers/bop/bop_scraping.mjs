// What BOP Capital Securities (bopcapital.com.pk, formerly Punjab Capital
// Securities, a subsidiary of The Bank of Punjab) sells in shares and ETFs,
// with no login. Its FAQ: "Any person who wishes to trade on the Pakistan
// Stock Exchange can sign up for Trading Terminal". Its commission slab, for
// the "Regular, Future" markets: 0.03 paisa per share from Rs 0.01 to 5.00,
// 0.05 from 5.01 to 30.00, "0.15% of value" above, "Minimum Commission is
// 0.03 paisas or 0.15% whichever is higher". The Pakistan Stock Exchange is
// its only place, so the catalogue is the exchange's whole ready-market
// book: the PSX regular deliverable list (REG.xml), read by
// brokers/nextcapital/psxBook.mjs.
//
//   https://bopcapital.com.pk/wp-content/uploads/2022/11/Commission-Slab.pdf   (fees)
//   https://bopcapital.com.pk/about-us/faqs/
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
//   node brokers/bop/bop_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("bop-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(psxBookSummary(rows));
