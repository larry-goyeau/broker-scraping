// GMO-Z.com Securities (Thailand) (SET member no. 10, GMO Internet group)
// is an online-only, self-service broker: "ให้บริการด้านซื้อขายหลักทรัพย์
// ออนไลน์แบบบริการตนเอง" (services page), with Cash Balance and Credit
// Balance accounts on Settrade Streaming. Its one place is the Stock
// Exchange of Thailand; its broker-list row names both boards (SET and
// mai, one XBKK order book). The "600+" securities of its marginable list
// are those the Credit Balance (margin) account may buy on credit, not a
// limit on the cash account. No page lists what can be bought or leaves
// out a board, NVDRs, DRs or ETFs, so the catalogue is the whole SET book.
//
//   https://th.trade.z.com/services.html
//   https://th.trade.z.com/   ("บัญชี Credit Balance สามารถซื้อขายหลักทรัพย์ได้กว่า 600+ ตัว")
//
// Left out (in ../kgithailand/setBook.mjs): warrants and derivative
// warrants, rights, foreign-board lines (.F, .Q), pre-IPO lines, and lines
// with no trade for more than 30 days (suspended, halted or delisting).
//
// Fees: the services page's commission table is filled from the site's
// public config, read here: internet 0.065% for both the Cash Balance and
// the Credit Balance account, 0.300% through an officer, plus 0.007%
// exchange fees and VAT 7% ("ค่าธรรมเนียมดังกล่าวยังไม่รวม ... 0.007%").
//   https://th.trade.z.com/apps/assets/data/config.json
//
//   node brokers/gmozth/gmozth_scraping.mjs

import { writeSetCatalogue } from "../kgithailand/setBook.mjs";
import { pageSays } from "../alphasec/pdfSays.mjs";

await pageSays("https://th.trade.z.com/services.html", [
  /ให้บริการด้านซื้อขายหลักทรัพย์ออนไลน์แบบบริการตนเอง/,
  /commission-cash-internet/,
], { raw: true });
const config = JSON.parse(await pageSays("https://th.trade.z.com/apps/assets/data/config.json", [/"commission"/], { raw: true }));
if (!/^0\.\d+%$/.test(config.commission?.cash?.internet || "")) throw new Error("GMO-Z commission config changed");
console.error(`commission, internet, cash balance: ${config.commission.cash.internet}`);

const rows = await writeSetCatalogue(import.meta.url, "gmozth-parsed.json");
if (rows.length < 1500) throw new Error(`only ${rows.length} SET rows`);
