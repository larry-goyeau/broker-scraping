// What GOINVEST (the app of KAP DEPO, ООО «KAPITAL-DEPOZIT», Tashkent)
// sells online, with no login: every share on the main market of the
// Republican Stock Exchange "Tashkent" (UZSE).
//
// GOINVEST's site: "KAP DEPO, the lovely folks behind GOINVEST, first
// opened their doors in June 2005 ... in the capital market of Uzbekistan";
// KAP DEPO's brokerage page: "Goinvest — Собственное мобильное приложение
// для удобного доступа к фондовому рынку Узбекистана", with its tariff (the
// "Tarifs" block): "1% от объёма сделки на РФБ «Тошкент»". The same line
// mentions the exchange's off-listing platform ("внелистинговой платформе
// РФБ «Тошкент»") without a rate, and the app pages name only the stock
// market, so the off-exchange board is left out. No page names a category
// or share class left out, so the catalogue is the exchange's share market
// (../freedomuzbekista/uzseBook.mjs): the ordinary and preferred lines of
// the issuers in the quotation list (Premium, Standard, Transit,
// Privatizatsiya), less suspended lines (the exchange's notices), lines
// that never traded and debt lines. Uzbekistan has one exchange; it lists
// no ETF, ETN or ETC. In sums (UZS, XSTE).
//
//   https://goinvest.uz/
//   https://kapdepo.com/broker_service
//   https://uzse.uz/isu_infos
//
// Fees: https://kapdepo.com/broker_service ("Обслуживание: 1% от объёма
// сделки на РФБ «Тошкент»"; "Индивидуальные скидки предоставляются при
// совершении сделок объемом более 1 млрд сумов").
//
//   node brokers/goinvest/goinvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { uzseListings } from "../freedomuzbekista/uzseBook.mjs";
import { says } from "../denizyatrm/evidence.mjs";
import fs from "node:fs";

await says("https://goinvest.uz/", [/KAP DEPO, the lovely folks behind GOINVEST/]);
await says("https://kapdepo.com/broker_service", [
  /Собственное мобильное приложение для удобного доступа к фондовому рынку Узбекистана/,
  /1% от объёма сделки на РФБ «Тошкент»/,
]);

const { rows, leftOut, listed, orderDay, noticesRead } = await uzseListings({ otc: false });
rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
const stamped = stampRows(withoutObligations(rows));
for (const ticker of ["URTS", "SQBN", "UZMK", "KVTS"]) {
  if (!stamped.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the UZSE book`);
}
if (stamped.length < 60) throw new Error(`only ${stamped.length} UZSE rows`);
fs.writeFileSync(new URL("goinvest-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));

console.error(`goinvest: ${stamped.length} rows; UZSE order list of ${orderDay}; ${noticesRead} suspension notices read; quotation list (STK): ${listed}`);
console.error(`left out (${leftOut.length}): ${leftOut.slice(0, 40).join("; ")}${leftOut.length > 40 ? " ..." : ""}`);
