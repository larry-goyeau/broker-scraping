// AKBF (АО ИК «АКБФ», formerly AK BARS Finance, Moscow) is a broker on the
// Moscow Exchange and SPB Exchange, through its app «АКБФ Трейд» and
// WebQUIK / QUIK X. It publishes no instrument list. Its tariff plans
// (Приложение № 6 к Регламенту, in force from 26.12.2025) price both places:
//
//   "1. Тарифный план «ИНВЕСТОР» ... 1.1. Вознаграждение за совершение сделок
//    на Фондовом рынке ПАО «Московская биржа» 1.1.1. Совершение сделок
//    купли- продажи Ценных бумаг, за исключением Еврооблигаций 0,15 % от
//    суммы Сделки, но не менее 1 рубля за Сделку"
//   "1.2. Вознаграждение за совершение сделок на Рынке иностранных ценных
//    бумаг ПАО «СПБ Биржа» ... 0,15 % от суммы Сделки, но не менее 1 у.е.
//    в валюте расчетов за Сделку"
//   https://akbf.ru/documents/information/tarifs
//   https://api.akbf.ru/file/download/02bbda09-f880-48db-9fb7-d7a4db3192fd.pdf
// The home page: "Покупайте акции, облигации и валюту напрямую на Московской
// бирже ... в приложении АКБФ Трейд" (https://akbf.ru/).
//
// So the catalogue is, with no list, each place's whole listing:
//   - Moscow Exchange: every admitted share, depositary receipt and
//     exchange fund (BPIF) in roubles (../sber/moexBook.mjs). The tariff
//     names no settlement of securities in another currency, so the yuan
//     books of the funds stay out; unit funds that are not ETFs stay out;
//   - SPB Exchange: only its foreign-securities market ("Рынок иностранных
//     ценных бумаг"), read from ../solid/spbBook.mjs in whatever currency
//     each line trades. Those lines are frozen since November 2023, so it
//     gives no row today; rows come back by themselves if trading resumes.
//     The Russian segment of SPB is not in AKBF's tariff and is left out.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the tariff page must still list the tariff plans, and
// the current tariff PDF must still be served.
//
//   node brokers/akbf/akbf_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { checkSpbFloors, spbCatalogue } from "../solid/spbBook.mjs";

await checkPages([
  { url: "https://akbf.ru/documents/information/tarifs", lenient: true, phrases: ["Тарифные планы на брокерское обслуживание"] },
  { url: "https://api.akbf.ru/file/download/02bbda09-f880-48db-9fb7-d7a4db3192fd.pdf", pdf: true, lenient: true },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
// Foreign segment only (see the header): no row while those boards are frozen.
const spb = await spbCatalogue({ currencies: null, segments: ["eng"] });
const rows = [...moex.rows, ...spb.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("akbf-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, spb: spb.left });
