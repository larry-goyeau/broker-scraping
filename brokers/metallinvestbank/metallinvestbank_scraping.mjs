// Metallinvestbank (Russia) is a bank broker on the Moscow Exchange,
// through QUIK. It publishes no instrument list. Its brokerage page names
// the Moscow Exchange stock market and lists what trades there, exchange
// funds (BPIF) included:
//
//   "Мы предоставляем бесплатный доступ к следующим рынкам Группы
//    «Московская Биржа»"
//   "паями паевых инвестиционных фондов (ОПИФы, ИПИФы, ЗПИФы), а также
//    паями биржевых паевых инвестиционных фондов (БПИФы)"
//   https://www.metallinvestbank.ru/fonds/broker/
//
//   Tariff "Базовый": "Комиссионное вознаграждение по биржевым сделкам
//   покупки-продажи ценных бумаг ... на фондовом рынке ПАО Московская
//   биржа": 0.025% of the deal through QUIK, 0.05% by phone or on paper,
//   exchange fee on top.
//   https://www.metallinvestbank.ru/fonds/broker/tariff/tariff/
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out: they are not
// exchange-traded funds. The page shows no yuan or other foreign-currency
// account on the stock market; the currency market is only on request
// ("о возможности подключения валютного рынка уточняйте по телефонам"),
// so the yuan books are left out and only rouble lines are kept.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test).
//
//   node brokers/metallinvestbank/metallinvestbank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://www.metallinvestbank.ru/fonds/broker/",
    lenient: true,
    phrases: [
      "Мы предоставляем бесплатный доступ к следующим рынкам Группы «Московская Биржа»",
      "а также паями биржевых паевых инвестиционных фондов (БПИФы)",
    ],
  },
  {
    url: "https://www.metallinvestbank.ru/fonds/broker/tariff/tariff/",
    lenient: true,
    phrases: ["Комиссионное вознаграждение по биржевым сделкам покупки-продажи ценных бумаг и биржевым сделкам РЕПО на фондовом рынке ПАО Московская биржа"],
  },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("metallinvestbank-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
