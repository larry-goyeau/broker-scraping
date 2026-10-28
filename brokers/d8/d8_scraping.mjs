// D8 (AO "Investitsionnaya kompaniya D8", Moscow, formerly IK "IT Invest")
// is a broker on the Moscow Exchange through QUIK, SMARTx and the D8 app.
// It publishes no instrument list, so the catalogue is the Moscow
// Exchange equity listing (../sber/moexBook.mjs): every admitted share,
// depositary receipt and exchange fund (BPIF). Unit funds that are not
// ETFs (OPIF, IPIF, ZPIF) stay out.
//
//   "Через Вашего Брокера Вы сможете совершать сделки со следующими
//    финансовыми инструментами: ПАО Московская Биржа секция «Фондовый
//    рынок»: сделки с ЦБ (купля-продажа, РЕПО); ПАО Московская Биржа
//    секция «Валютный рынок»: сделки с иностранной валютой"
//   https://d8.capital/upload/vote/4c1/cy7w612s5gfrcb3y1csmyczydp0iwo1m/KID.pdf
//
// Fees: "Совершение Сделок на организованных торгах ПАО «Московская
// Биржа»" ... "с Ценными бумагами, за исключением облигаций иностранных
// эмитентов" 0,015 % in the order book, 0,2 % negotiated.
//   https://d8.capital/tariffs/
//   https://d8.capital/disclosure/brokerage_activity/ (tariff PDF)
//
// Currency: the account trades currency on the exchange and withdraws
// yuan ("Китайский юань 5 500 руб. вне зависимости от суммы"), so the
// yuan books of the funds quoted in CNY are kept next to their rouble
// books.
//
// Nothing is excluded on these pages. "Для совершения сделок c ПФИ,
// иностранными ЦБ и некоторыми сложными финансовыми инструментами
// требуется пройти тестирование или получить статус квалифицированного
// инвестора": that depends on the client, so foreign issuers are flagged
// in raw instead of dropped. Restriction in broker-list.json: none.
//
//   node brokers/d8/d8_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://d8.capital/tariffs/",
    lenient: true,
    phrases: ["Фондовый рынок Процент от суммы сделки", "Сделки с иными ценными бумагами", "Китайский юань 5 500 руб. вне зависимости от суммы"],
  },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("d8-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
