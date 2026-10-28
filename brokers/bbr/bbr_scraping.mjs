// BBR Broker (OOO «ББР БРОКЕР», St Petersburg, Russia) is a broker on the
// Moscow Exchange only, through QUIK and its mobile app. It publishes no
// instrument list. Its pages name the market and the instruments, exchange
// funds included:
//
//   "Получать дополнительный доход от операций с различными финансовыми
//    инструментами: акциями, облигациями, биржевыми фондами, валютой."
//   https://bbrbroker.ru/products/brokerskiy-schyet.php
//
// Fees: tariff «Успешный инвестор», "Сделки с ценными бумагами на
// Московской бирже 0,15% от суммы сделки, но не менее 0,1 ₽ за сделку";
// «Профессиональный трейдер» 0,07% to 0,17% by daily turnover.
//   https://bbrbroker.ru/rates/
//   Full tariff (from 01.10.2026): "2.1.1. Фондовый рынок ПАО Московская
//   Биржа ... 0,15 % от оборота за день"
//   https://bbrbroker.ru/upload/iblock/911/4yrntyuw46ysu8b828rpy2w268tac7w0.pdf
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. No BBR page leaves
// out a board, a segment or the funds.
//
// Yuan: BBR trades currency for its clients ("Сделки с иностранными
// валютами и драгоценными металлами 0,3% от оборота за день") and its full
// tariff takes yuan on the broker account ("Комиссия за зачисление
// иностранной валюты на Брокерский счет ... CNY - не менее 299 CNY"), so
// the yuan books of the funds quoted in CNY are kept next to their rouble
// books.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test): that depends on the client.
//
//   node brokers/bbr/bbr_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://bbrbroker.ru/rates/",
    lenient: true,
    phrases: ["Сделки с ценными бумагами на Московской бирже 0,15% от суммы сделки", "Сделки с иностранными валютами и драгоценными металлами"],
  },
  {
    url: "https://bbrbroker.ru/products/brokerskiy-schyet.php",
    lenient: true,
    phrases: ["акциями, облигациями, биржевыми фондами, валютой"],
  },
  { url: "https://bbrbroker.ru/upload/iblock/911/4yrntyuw46ysu8b828rpy2w268tac7w0.pdf", pdf: true, lenient: true },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("bbr-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
