// What Mizrahi-Tefahot Bank (Israel) sells online in shares and ETFs, with
// no login: every share and exchange-traded fund on the Tel Aviv Stock
// Exchange, and US shares and ETFs, a place for which it publishes no list.
//
// Its list of what can be done where: "שוק ההון הפעולה: קניית ומכירת
// ניירות ערך אפשר לבצע: בסניף בטלפון באתר באפליקציה" (buying and selling
// securities: at the branch, by phone, on the site and in the app). Annex E
// of its tariff ("נספח ה' - הטבות לפעילות בערוצים ישירים") prices both
// places on the internet service ("שירות האינטרנט"): "קניה/מכירה של ניירות
// ערך בבורסה בתל אביב ... מניות ואגרות חוב" and "קניה/מכירה של ניירות ערך
// בחוץ לארץ - מניות, אגרות חוב וקרנות נאמנות". No page names an exchange,
// board or kind of share or fund it leaves out, and none gives a count.
//
// Tel Aviv: the exchange's whole book (../altshuler/taseBook.mjs): its
// shares (ordinary shares, REITs, partnership units, dual-listed and
// foreign shares), its Israeli ETFs (kranot sal) and the foreign UCITS
// ETFs cross-listed there, less suspended lines. In shekels (prices in
// agorot), MIC XTAE.
//
// United States (broker-list.json's foreign place; the tariff says
// "abroad" with no country): no exchange is named, so the catalogue keeps
// the country's exchanges, the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). OTC lines
// are not named and not in the book. One NBBO market: one row per title,
// on its primary listing, in dollars.
//
//   https://www.mizrahi-tefahot.co.il/online-banking/our-services/
//   https://www.mizrahi-tefahot.co.il/interest-list/
//   https://market.tase.co.il/en/market_data/securities/data/all
//
// Fees: annex E (internet service, as of 12/08/2025): TASE shares and
// bonds 0.52%, minimum 45 shekels, maximum 9,675 (clerk 0.64%, minimum
// 50); securities abroad 0.30%, minimum $25, maximum $6,750 (clerk 0.89%,
// minimum $75). Part 4 of the full tariff for individuals and small
// businesses (securities) gives the clerk rates and the custody fees.
//   https://www.mizrahi-tefahot.co.il/media/arutzyashir.xls (and .pdf)
//   https://www.mizrahi-tefahot.co.il/media/smallbusiness4.pdf
//
//   node brokers/mizrahi/mizrahi_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { taseBook } from "../altshuler/taseBook.mjs";
import { check, legacyXlsText, pageText, servedPdf } from "../bankleumi/tariffText.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const SITE = "https://www.mizrahi-tefahot.co.il";
const ANNEX = `${SITE}/media/arutzyashir.xls`;
const SERVICES = `${SITE}/online-banking/our-services/`;

check(ANNEX, await legacyXlsText(ANNEX), [
  /שירות האינטרנט/,
  /קניה\/מכירה של ניירות ערך בבורסה בתל/,
  /קניה\/מכירה של ניירות ערך בחוץ לארץ/,
]);
await servedPdf(`${SITE}/media/smallbusiness4.pdf`);
const services = await pageText(SERVICES);
if (services === null) throw new Error(`${SERVICES} answered a bot-wall challenge`);
check(SERVICES, services, [/הפעולה: קניית ומכירת ניירות ערך אפשר לבצע: בסניף בטלפון באתר באפליקציה/]);

const tase = await taseBook();
const us = await usBook();
const rows = stampRows(withoutObligations([...tase.rows, ...us]));
if (rows.filter((row) => row.mic === "XTAE").length < 800) throw new Error("short TASE part");
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("mizrahi-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`mizrahi: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `TASE ${tase.tradeDate} lists ${JSON.stringify(tase.counts)}, dropped ${tase.dropped.join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
