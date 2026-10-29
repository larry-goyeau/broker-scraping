// Finup (ООО «Финап24», Minsk) sells Belarusian shares and bonds through its
// web platform and app finup (https://invest.finup.by/). Its brokerage
// tariff (Прейскурант тарифов, from 21 May 2025) prices trades made on the
// platform in the trading system of the Belarusian Currency and Stock
// Exchange:
//
//   "Совершение сделок в торговой системе ОАО «Белорусская валютно-фондовая
//    биржа»: 2.1. физического лица, заключившего с ООО "Финап24" договор на
//    комплексное брокерское обслуживание при работе на web площадке и (или)
//    в мобильном приложении finup ... - с акциями 0,3% от суммы сделки, но
//    не менее 8,00 бел. руб."
//   https://finup24.by/wp-content/uploads/2025/05/TARIFY-na-brokerskie-uslugi-OOO-Finap24-s-21.05.2025.pdf
//   https://finup24.by/o-kompanii/tarify/
// Its share page: "Как купить акции? С использованием площадки finup ...
// Регистрируйтесь в личном кабинете и узнайте, какие акции есть в наличии."
//   https://finup.by/shares/p/shares-buy
//
// Which shares are "in stock" is shown only after login, so the place is
// taken whole: every share admitted to circulation on the BCSE
// (../aigenis/bcseShares.mjs: the four share kinds of the exchange's
// securities directory, off-list segment included, in Belarusian roubles;
// shares not admitted are left out). The BCSE lists no ETF. Bonds are not
// shares and are not added.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the share page must still carry the sentence above,
// and the tariff PDF must still be served.
//
//   node brokers/finup/finup_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bcseShares, getText, words } from "../aigenis/bcseShares.mjs";
import fs from "node:fs";

const SHARES_PAGE = "https://finup.by/shares/p/shares-buy";
const TARIFF = "https://finup24.by/wp-content/uploads/2025/05/TARIFY-na-brokerskie-uslugi-OOO-Finap24-s-21.05.2025.pdf";

if (!/Регистрируйтесь в личном кабинете и узнайте, какие акции есть в наличии/.test(words(await getText(SHARES_PAGE)))) {
  throw new Error(`${SHARES_PAGE} no longer says how shares are bought`);
}
const tariff = await fetch(TARIFF, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60_000) });
const head = Buffer.from(await tariff.arrayBuffer()).subarray(0, 5).toString();
if (!tariff.ok || head !== "%PDF-") throw new Error(`${TARIFF} answered ${tariff.status} ${head}`);

const { rows, counts } = await bcseShares();
for (const ticker of ["T0146-S0012", "SberB-S0009"]) {
  if (!rows.some((row) => row.ticker === ticker && /^BY/.test(row.isin))) throw new Error(`${ticker} is missing from the BCSE book`);
}
if (rows.length < 50) throw new Error(`only ${rows.length} BCSE shares`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const stamped = stampRows(withoutObligations(rows));
if (stamped.length !== rows.length) throw new Error(`${rows.length - stamped.length} shares were taken for bonds`);
fs.writeFileSync(new URL("finup-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
const levels = Object.entries(counts.levels).map(([level, count]) => `${count} ${level}`).join(", ");
console.error(`BCSE: ${stamped.length} shares (${levels}); ${counts.noIsin} without ISIN, ${counts.notToday} not trading today, ${counts.noTradeYear} with no trade in a year`);
