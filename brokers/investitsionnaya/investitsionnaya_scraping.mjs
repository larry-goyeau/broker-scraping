// Investitsionnaya Palata (Investpalata, Voronezh, Russia) is a broker
// for private clients on the Moscow Exchange, through QUIK. It publishes
// no instrument list:
//
//   "Основные направления деятельности компании — брокерское обслуживание
//    частных клиентов на Московской бирже" (site footer)
//
//   "Вознаграждение ООО «Инвестиционная палата» при операциях на фондовом
//    и валютном рынках указаны в разделе 22 Регламента обслуживания
//    клиентов." Section 22.1.1 of the regulations in force from 01.09.2026,
//   tariff "Миллионер. Дешевле других": deals in shares on the Moscow
//   Exchange stock market ("в ТС ФР МБ"), 0.02242% of daily turnover up to
//   5 million roubles, down to 0.00309%, exchange fee on top.
//   https://investpalata.ru/%d1%81%d1%82%d0%be%d0%b8%d0%bc%d0%be%d1%81%d1%82%d1%8c-%d0%be%d0%b1%d1%81%d0%bb%d1%83%d0%b6%d0%b8%d0%b2%d0%b0%d0%bd%d0%b8%d1%8f/
//   https://investpalata.ru/brok_docs/ (Регламент обслуживания клиентов
//   ред. 01.09.2026v6.pdf; Ключевая информация о Договоре о брокерском
//   обслуживании ред. 17.08.2026v5.pdf)
//
// Its key-information document lists the securities it trades "на фондовом
// рынке ПАО Московская Биржа" and names no exclusion of exchange funds, so
// the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out.
//
// Currency: regulations 5.2.2 let foreign-currency cash be credited to the
// account used for "Фондового рынка Московской Биржи", and the currency
// market account trades CNYRUB, so the yuan books of the funds quoted in
// CNY are kept next to their rouble books.
//
// Foreign issuers: the key-information document says "Брокер тестирование клиентов не
// осуществляет и не предоставляет доступ к указанным сделкам
// неквалифицированным инвесторам" (foreign securities among them). That
// depends on the client, so the two foreign lines are kept with a remark
// in raw: qualified investors only at this broker.
//
// SPB Exchange: the regulations also register clients there, but
// broker-list.json gives only the Moscow Exchange, so it is left out.
//
// Restriction in broker-list.json: none.
//
//   node brokers/investitsionnaya/investitsionnaya_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

const FEES = "https://investpalata.ru/%d1%81%d1%82%d0%be%d0%b8%d0%bc%d0%be%d1%81%d1%82%d1%8c-%d0%be%d0%b1%d1%81%d0%bb%d1%83%d0%b6%d0%b8%d0%b2%d0%b0%d0%bd%d0%b8%d1%8f/";

await checkPages([
  {
    url: FEES,
    lenient: true,
    phrases: [
      "Вознаграждение ООО «Инвестиционная палата» при операциях на фондовом и валютном рынках указаны в разделе 22 Регламента обслуживания клиентов.",
      "брокерское обслуживание частных клиентов на Московской бирже",
    ],
  },
  {
    url: "https://investpalata.ru/wp-content/uploads/2026/08/%D0%A0%D0%B5%D0%B3%D0%BB%D0%B0%D0%BC%D0%B5%D0%BD%D1%82-%D0%BE%D0%B1%D1%81%D0%BB%D1%83%D0%B6%D0%B8%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F-%D0%BA%D0%BB%D0%B8%D0%B5%D0%BD%D1%82%D0%BE%D0%B2-%D1%80%D0%B5%D0%B4.-01.09.2026v6.pdf",
    pdf: true,
    lenient: true,
  },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

for (const row of rows) {
  if (row.raw.includes("foreign issuer")) row.raw += " | Investpalata runs no test: qualified investors only";
}

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("investitsionnaya-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
