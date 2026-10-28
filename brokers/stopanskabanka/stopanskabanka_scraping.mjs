// What Stopanska banka (SB Broker) sells on the Macedonian Stock Exchange,
// with no login. The place listed for it here is Skopje: its broker page
// offers "Тргување со хартии од вредност на Македонската берза" (trading
// securities on the Macedonian Stock Exchange) and electronic orders
// "преку E-TRADER", and the tariff prices "Тргување со акции преку
// Македонската берза, во име и за сметка на правни и физички лица"
// (trading shares on the Macedonian Stock Exchange for companies and
// individuals). Neither page names a board, segment or share class it
// leaves aside, so the catalogue is the whole Skopje share book: Super,
// Exchange and Mandatory Listing, the special-reporting market and the
// Free Market, ordinary and priority shares. (The same page also offers
// "Тргување на странски берзи со акции, обврзници и ETF", foreign markets
// with no list of exchanges; they are not a place of this broker here.)
//
//   https://www.stb.com.mk/finansiski-pazari/brokerski-uslugi/
//   fees: https://www.stb.com.mk/media/lg5ldbyj/tarifa_broker_mak_01-02-2024.pdf
//         (shares 1.015 % min. MKD 500 up to MKD 500,000 a day, down to
//          0.40 % above MKD 10 million; plus exchange and depository costs)
//
// Left out, as the shared book does: government, corporate and perpetual
// bonds (bonds are on the tariff but are not in this catalogue), lines not
// in the exchange's trading schedule (suspended, matured or delisted),
// issuers in bankruptcy or liquidation, and lines that never traded.
// Skopje lists no ETF, ETN or ETC. Every share trades in denars (MKD).
// The book and the ISINs come from the exchange through ../ttkbanka/mseBook.mjs
// (https://www.mse.mk/en/stats/current-schedule and the symbol pages).
//
//   node brokers/stopanskabanka/stopanskabanka_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { mseBook, mseLeftOut } from "../ttkbanka/mseBook.mjs";

const OUTPUT = new URL("stopanskabanka-parsed.json", import.meta.url);

const rows = await mseBook();
if (rows.length < 100) throw new Error(`only ${rows.length} Skopje shares came back`);
if (rows.some((row) => !row.isin || !/^MK/.test(row.isin))) throw new Error("a Skopje line without a Macedonian ISIN stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const left = await mseLeftOut();
const summary = Object.entries(left).map(([reason, tickers]) => `${tickers.length} ${reason}`).join(", ");
console.error(`${stamped.length} Skopje shares written; left out: ${summary}`);
