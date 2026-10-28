// What TTK Banka sells on the Macedonian Stock Exchange, with no login.
// Its only place is Skopje: the bank is "овластен учесник на пазарот на
// капитал од 2003 година" (an authorised capital market participant since
// 2003), takes orders in its branches and through eTrader, "систем за
// давање електронски налози ... од Македонска берза" (electronic orders on
// the Macedonian Stock Exchange). The tariff prices "Купување и продавање
// акции" (buying and selling shares) for any client, with no list of
// boards, segments or share classes it leaves aside, and none of its
// securities pages names one. So the catalogue is the whole Skopje share
// book: Super, Exchange and Mandatory Listing, the special-reporting market
// and the Free Market, ordinary and priority shares.
//
//   https://www.ttk.com.mk/Web/ФИЗИЧКИ_ЛИЦА/Хартии_од_вредност/Работа_со_хартии_од_вредност.aspx
//   https://www.ttk.com.mk/Web/ФИЗИЧКИ_ЛИЦА/Хартии_од_вредност/Електронско_тргување_со_хартии_од_вредност.aspx
//   fees: https://www.ttk.com.mk/cms/Upload/Tarifa/Hartii%20od%20vrednost/TАРИФА%20ЗА%20НАДОМЕСТОЦИ%20НА%20УСЛУГИ%20ОД%20ОБЛАСТА%20НА%20РАБОТА%20СО%20ХАРТИИ%20ОД%20ВРЕДНОСТ.pdf
//         (shares 0.80 % min. MKD 250 up to MKD 3 million of past turnover,
//          down to 0.30 %; plus exchange and depository fees)
//
// Left out, as the shared book does: government, corporate and perpetual
// bonds (bonds are on the tariff but are not in this catalogue), lines not
// in the exchange's trading schedule (suspended, matured or delisted),
// issuers in bankruptcy or liquidation, and lines that never traded.
// Skopje lists no ETF, ETN or ETC. Every share trades in denars (MKD).
// The book and the ISINs come from the exchange through ./mseBook.mjs
// (https://www.mse.mk/en/stats/current-schedule and the symbol pages).
//
//   node brokers/ttkbanka/ttkbanka_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { mseBook, mseLeftOut } from "./mseBook.mjs";

const OUTPUT = new URL("ttkbanka-parsed.json", import.meta.url);

const rows = await mseBook();
if (rows.length < 100) throw new Error(`only ${rows.length} Skopje shares came back`);
if (rows.some((row) => !row.isin || !/^MK/.test(row.isin))) throw new Error("a Skopje line without a Macedonian ISIN stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const left = await mseLeftOut();
const summary = Object.entries(left).map(([reason, tickers]) => `${tickers.length} ${reason}`).join(", ");
console.error(`${stamped.length} Skopje shares written; left out: ${summary}`);
