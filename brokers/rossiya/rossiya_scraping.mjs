// Bank Rossiya (AO "AB "Rossiya", St Petersburg) is a broker on the Moscow
// Exchange, through QUIK. It publishes no instrument list. Its tariff
// prices exchange deals on the Moscow Exchange stock market:
//
//   "Заключение сделок на ПАО «Московская биржа» (фондовый рынок), АО
//    «Санкт-Петербургская Валютная Биржа» (фондовый рынок)": tariff plan
//   «Основной» 0,3 %, «Профессиональный» 0,09% (at least 100 roubles) of
//   daily turnover up to 500 000 roubles, down to 0,0065%.
//   https://abr.ru/upload/iblock/41a/Тарифы_комиссионного_вознаграждения_брокерские_услуги.pdf
//
// Its regulation (Регламент предоставления АО «АБ «РОССИЯ» брокерских
// услуг на рынке ценных бумаг, версия 7.4, from 01.09.2026, on
// https://abr.ru/about/raskrytie-informatsii/disclosure-securities-market/broker-activity/)
// says, in 4.5:
//
//   "В рамках настоящего Регламента запрещено проведение операций с
//    ценными бумагами иностранных эмитентов (за исключением ... облигаций
//    ...) и ценными бумагами, расчеты или выплаты доходов по которым
//    производятся в валюте, отличной от валюты Российской Федерации."
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs) in
// roubles only, without the shares of foreign issuers (OKEY GDR,
// Luxembourg; VEON, Bermuda): every admitted share of a Russian issuer and
// every exchange fund (BPIF, all Russian funds). Its information
// documents for clients include the BPIF unit (Инф_документ_инвестиционный_пай_рос_биржевого_паев_инвест_фонда.pdf),
// and nothing excludes exchange funds. Unit funds that are not ETFs (OPIF,
// IPIF, ZPIF) stay out. The yuan books are out under the same clause 4.5.
//
// SPB Exchange: the tariff and the regulation also name the stock section
// of the St Petersburg Currency Exchange, a different place; broker-list.json
// gives only the Moscow Exchange, so it is left out here.
//
// Restriction in broker-list.json: none.
//
//   node brokers/rossiya/rossiya_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://abr.ru/about/raskrytie-informatsii/disclosure-securities-market/broker-activity/",
    lenient: true,
    phrases: ["Регламент предоставления АО «АБ «РОССИЯ» брокерских услуг на рынке ценных бумаг"],
  },
  { url: encodeURI("https://abr.ru/upload/iblock/41a/Тарифы_комиссионного_вознаграждения_брокерские_услуги.pdf"), pdf: true, lenient: true },
]);

const { rows: all, left } = await moexCatalogue({ currencies: ["RUB"] });
const rows = all.filter((row) => {
  if (row.isin.startsWith("RU")) return true;
  left["foreign issuer: barred by regulation 4.5"] = (left["foreign issuer: barred by regulation 4.5"] || 0) + 1;
  return false;
});
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("rossiya-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
