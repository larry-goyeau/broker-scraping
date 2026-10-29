// What Bank Leumi (Israel) sells online in shares and ETFs, with no login:
// every share and exchange-traded fund on the Tel Aviv Stock Exchange, and
// US shares and ETFs, a place for which it publishes no list.
//
// Its online trading service, Leumi Trade (site and app): "אתר לאומי טרייד
// מאפשרים לכם ליהנות מחוויית מסחר בבורסת תל אביב ובבורסות מובילות בארה"ב
// ובאירופה" (trading on the Tel Aviv exchange and on leading exchanges in
// the US and Europe). Its full tariff for individuals prices both online, in
// annex E (direct channels, "אינטרנט וסלולר - גישה ישירה/TRADE ON"): TASE
// shares and bonds ("קניה,מכירה של ני"ע הנסחרים בבורסה בת"א") and shares
// and funds abroad ("קניה,מכירה של ני"ע בחוץ לארץ: -מניות וקרנות נאמנות").
// No page names a US exchange, board or kind of share or fund left out,
// and none gives a count.
//
// Tel Aviv: the exchange's whole book (../altshuler/taseBook.mjs): its
// shares (ordinary shares, REITs, partnership units, dual-listed and
// foreign shares), its Israeli ETFs (kranot sal) and the foreign UCITS
// ETFs cross-listed there, less suspended lines. In shekels (prices in
// agorot), MIC XTAE.
//
// United States (broker-list.json's foreign place; the tariff says
// "abroad" and the site "leading exchanges in the US"): no exchange is
// named, so the catalogue keeps the country's exchanges, the whole US
// exchange book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt, warrants, rights,
// units, when-issued lines and listed notes (usBook) and bonds
// (withoutObligations). OTC lines are not named and not in the book. One
// NBBO market: one row per title, on its primary listing, in dollars.
//
// Europe is left out: the site and the app ("ובשש בורסות מובילות באירופה",
// six leading European exchanges) never name the exchanges, so no
// European place can be built from Leumi's words. broker-list.json gives
// TASE and the United States.
//
//   https://www.leumi.co.il/he/investments/leumi-trade
//   https://apps.apple.com/il/app/id438890482
//   https://market.tase.co.il/en/market_data/securities/data/all
//
// Fees: the full tariff for individuals and small businesses, annex E
// (direct channels): TASE shares and bonds "0.4% מינימום 26 ש"ח" (clerk
// 0.65%, minimum 27 shekels); shares and funds abroad "0.3% מינימום 24
// דולר ... מכסימום 6750 דולר" (clerk 0.9%, minimum $25).
//   https://www.leumi.co.il/he/economic-info/commissions_and_fees
//   https://www.bankleumi.co.il/static-files/Commissions_Leumi/AmlotYechidimL.xlsx
//
// leumi.co.il pages sit behind an Imperva bot wall that sometimes answers
// a challenge instead of the page: the site sentence is then reported and
// skipped; the tariff workbook (a static file) is always checked.
//
//   node brokers/bankleumi/bankleumi_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { taseBook } from "../altshuler/taseBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { check, pageText, workbookText } from "./tariffText.mjs";

const TARIFF = "https://www.bankleumi.co.il/static-files/Commissions_Leumi/AmlotYechidimL.xlsx";
const TRADE = "https://www.leumi.co.il/he/investments/leumi-trade";

check(TARIFF, await workbookText(TARIFF), [
  /קניה,מכירה של ני"ע הנסחרים בבורסה בת"א/,
  /- אינטרנט וסלולר - גישה ישירה\/TRADE ON 0\.4% מינימום 26 ש"ח/,
  /קניה,מכירה של ני"ע בחוץ לארץ: -מניות וקרנות נאמנות - אינטרנט וסלולר - גישה ישירה\/TRADE ON 0\.3% מינימום 24 דולר/,
]);
const site = await pageText(TRADE);
if (site === null) console.error(`${TRADE} answered a bot-wall challenge: its sentence was not checked`);
else check(TRADE, site, [/מחוויית מסחר בבורסת תל אביב ובבורסות מובילות בארה"ב ובאירופה/]);

const tase = await taseBook();
const us = await usBook();
const rows = stampRows(withoutObligations([...tase.rows, ...us]));
if (rows.filter((row) => row.mic === "XTAE").length < 800) throw new Error("short TASE part");
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("bankleumi-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`bankleumi: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `TASE ${tase.tradeDate} lists ${JSON.stringify(tase.counts)}, dropped ${tase.dropped.join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
