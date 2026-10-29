// What Eurohaus (Брокерска куќа ЕУРОХАУС АД Скопје) sells online, with no
// login: every share on the Macedonian Stock Exchange, its only place.
//
// Its services page: the E-Trader application "им овозможува на клиентите
// праќање електронски налози до брокерската куќа" (lets clients send
// electronic orders to the broker) "доволно е да имате електронски уред со
// пристап на интернет"; its tariff prices "АКЦИИ И ОБВРЗНИЦИ: За секоја
// куповна/продажна трансакција на МБХВ" and E-Trader access on the MSE.
// Foreign markets are announced only ("наскоро ќе започне да ја нуди
// услугата прием и пренос на налози за тргување на странски пазари"), so
// they are left out. No page names a segment or share class left out, so
// the catalogue is the exchange's book (../ttkbanka/mseBook.mjs): every
// share in the MSE's trading schedule today, Official and Regular market,
// ordinary, priority and preference shares, less issuers in bankruptcy or
// liquidation and lines that never traded. Bonds stay out. The MSE lists no
// ETF. In denars (MKD, XMAE).
//
//   https://www.eurohaus.com.mk/services.html
//   https://www.eurohaus.com.mk/about.html (links the tariff)
//   https://www.mse.mk/en/stats/current-schedule
//
// Fees: https://eurohaus.com.mk/public_links/Тарифник.pdf ("ТАРИФНИК ЗА
// НАДОМЕСТОЦИ ПРИ ТРГУВАЊЕ НА МАКЕДОНСКА БЕРЗА": shares and bonds, each
// purchase or sale on the MSE, "Максимален износ по трансакција 2,95%",
// minimum 150 MKD per trade and 500 MKD per order; E-Trader level 1 free).
//
//   node brokers/eurohaus/eurohaus_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { mseBook, mseLeftOut } from "../ttkbanka/mseBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";

await says("https://www.eurohaus.com.mk/services.html", [
  /им овозможува на клиентите праќање електронски налози до брокерската куќа/,
  /наскоро ќе започне да ја нуди услугата прием и пренос на налози/,
]);
await says("https://www.eurohaus.com.mk/about.html", [/ТАРИФНИК/]);
await pdfAnswers("https://eurohaus.com.mk/public_links/%D0%A2%D0%B0%D1%80%D0%B8%D1%84%D0%BD%D0%B8%D0%BA.pdf");

const rows = await mseBook();
if (rows.length < 100) throw new Error(`only ${rows.length} Skopje shares came back`);
if (rows.some((row) => !row.isin || !/^MK/.test(row.isin))) throw new Error("a Skopje line without a Macedonian ISIN stayed in the book");
const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("eurohaus-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));

const left = await mseLeftOut();
console.error(`eurohaus: ${stamped.length} Skopje shares written; left out: ${Object.entries(left).map(([reason, tickers]) => `${tickers.length} ${reason}`).join(", ")}`);
