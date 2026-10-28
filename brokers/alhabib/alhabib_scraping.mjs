// What AL Habib Capital Markets (ahcml.com), a subsidiary of Bank AL Habib,
// sells in shares and ETFs, with no login. Its online platform, AL Habib
// Capital GROW, is a "standard online stock trading platform ... for
// Pakistan's capital market"; the GROW Basic commission is "PKR 0.03 per
// share or 0.15% of the trade value, whichever is higher" (GROW Premium,
// with a dedicated trader, "PKR 0.05 per share or 0.17%"). The Pakistan
// Stock Exchange is its only place, so the catalogue is the exchange's whole
// ready-market book: the PSX regular deliverable list (REG.xml), read by
// brokers/nextcapital/psxBook.mjs.
//
//   https://www.ahcml.com/grow   (fees and account types)
//   https://www.ahcml.com/assets/uploads/Online-Trading-Manual.pdf
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
// The account types on the GROW page narrow the list only for the client who
// picks them, so they remove nothing here: "Grow with Shariah Account"
// ("Trade on Ready Counter only", Shariah-compliant stocks and "Meezan
// Pakistan ETF"), the Sahulat Account ("Trading allowed in Ready Market")
// and the Minor Account ("Only trade in regular market").
//
//   node brokers/alhabib/alhabib_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("alhabib-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(psxBookSummary(rows));
