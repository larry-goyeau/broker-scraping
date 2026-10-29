// What PEPPER (Bank Leumi's digital bank, Israel) sells in its investment
// account, online only, with no login: every share and exchange-traded fund
// on the Tel Aviv Stock Exchange, and US shares and ETFs, a place for which
// it publishes no list.
//
// Its home page: "חשבון השקעות ב-PEPPER לסחור בקלות במגוון רחב של נכסים
// בישראל, בארה"ב ובבורסות המובילות באירופה. בטרייד תוכלו לנהל רשימות מעקב
// ותיקים וירטואליים" (an investment account to trade assets in Israel, the
// US and the leading European exchanges, through Leumi's Trade platform).
// PEPPER has no branch: the account lives in its app and on Leumi Trade.
// No page names an exchange, board or kind of share or fund left out, and
// none gives a count. (The former Pepper Invest app, ~100 S&P 100 shares,
// is no longer in the App Store.)
//
// Israel (broker-list.json's "Israel"): its one exchange, Tel Aviv, whole
// (../altshuler/taseBook.mjs): shares (ordinary shares, REITs, partnership
// units, dual-listed and foreign shares), Israeli ETFs (kranot sal) and the
// foreign UCITS ETFs cross-listed there, less suspended lines. In shekels
// (prices in agorot), MIC XTAE.
//
// United States: no exchange is named, so the catalogue keeps the
// country's exchanges, the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). OTC lines
// are not named and not in the book. One NBBO market: one row per title,
// on its primary listing, in dollars.
//
// Europe is left out: "הבורסות המובילות באירופה" names no exchange (Leumi
// Trade's app says six, unnamed), so no European place can be built from
// PEPPER's words. broker-list.json gives Israel and the United States.
//
//   https://www.pepper.co.il/
//   https://market.tase.co.il/en/market_data/securities/data/all
//
// Fees, the same page (FAQ): "משלמים רק 4₪ לפעולות מסחר בישראל (עד סכום של
// 30,000 ₪ לפעולה*) ו- 4$ לפעולת מסחר בחו"ל (עד סכום של 8,000$ לפעולה*)",
// third-party costs included; above those amounts "בהתאם לתעריפון העמלות"
// (Leumi's tariff, see ../bankleumi); "דמי הניהול הם 0.15% לרבעון".
//
//   node brokers/pepper/pepper_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { taseBook } from "../altshuler/taseBook.mjs";
import { check, pageText } from "../bankleumi/tariffText.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const HOME = "https://www.pepper.co.il/";

const home = await pageText(HOME);
if (home === null) throw new Error(`${HOME} answered a bot-wall challenge`);
check(HOME, home, [
  /חשבון השקעות ב-PEPPER לסחור בקלות במגוון רחב של נכסים בישראל, בארה"ב ובבורסות המובילות באירופה/,
  /משלמים רק 4₪ לפעולות מסחר בישראל \(עד סכום של 30,000 ₪ לפעולה\*\) ו- 4\$ לפעולת מסחר בחו"ל \(עד סכום של 8,000\$ לפעולה\*\)/,
  /דמי הניהול הם 0\.15% לרבעון/,
]);

const tase = await taseBook();
const us = await usBook();
const rows = stampRows(withoutObligations([...tase.rows, ...us]));
if (rows.filter((row) => row.mic === "XTAE").length < 800) throw new Error("short TASE part");
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("pepper-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`pepper: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`TASE ${tase.tradeDate} lists ${JSON.stringify(tase.counts)}, dropped ${tase.dropped.join(", ") || "none"}; halts: ${us.report.halts.join(", ")}`);
