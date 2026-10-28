// What Rafi Securities (rafisecurities.com) sells in shares and ETFs, with
// no login. Rafi holds a "Trading Right Entitlement Certificate of the
// Pakistan Stock Exchange"; its online application Vtrade "brings the
// Pakistan Stock Exchange right to your fingertips", and its tariff is
// "Rs 0.03 per share or 0.15% of the transaction value, whichever is
// higher". Its PMEX account (commodities, forex, indices) is a separate
// exchange and holds no shares. The Pakistan Stock Exchange is its only
// place for shares, so the catalogue is the exchange's whole ready-market
// book: the PSX regular deliverable list (REG.xml), read by
// brokers/nextcapital/psxBook.mjs.
//
//   https://rafisecurities.com/commission-structure-charges-detail/   (fees)
//   https://rafisecurities.com/online-trading/
//   https://rafisecurities.com/faqs/
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
// Rafi also runs an Islamic brokerage window where "You can trade shares of
// listed companies that pass Shariah screening" (rafisecurities.com/al-rafi/):
// that is an account the client chooses, so it removes nothing here.
//
//   node brokers/rafi/rafi_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("rafi-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(psxBookSummary(rows));
