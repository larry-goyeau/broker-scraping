// What Integrated Equities (iel.net.pk) sells in shares and ETFs, with no
// login. IEL offers "Retail & Institutional Equity Brokerage" on the
// Pakistan Stock Exchange through its trading platform and mobile app. Its
// commission table, by share price: 0.03 (Rs 0.01-9.99), 0.05 (Rs 10-29.99),
// then "0.03 OR 0.15% Transaction Value (whichever is Higher)". The Pakistan
// Stock Exchange is its only place, so the catalogue is the exchange's whole
// ready-market book: the PSX regular deliverable list (REG.xml), read by
// brokers/nextcapital/psxBook.mjs.
//
//   https://www.iel.net.pk/OpenAccount.html   (fees)
//   https://www.iel.net.pk/BrokerageService.html
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
// The "Sahulat (Easy) Account" comes with an investment limit: that depends
// on the account the client opens, so it removes nothing here.
//
//   node brokers/integratedequiti/integratedequiti_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("integratedequiti-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(psxBookSummary(rows));
