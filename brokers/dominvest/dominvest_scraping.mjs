// DOM.Invest is the broker app of Bank DOM.RF (AO «Банк ДОМ.РФ», Russia).
// The bank is a broker on the Moscow Exchange stock market and publishes
// no instrument list:
//
//   "Операции на торгах Московской биржи (широкий спектр инструментов,
//    операции РЕПО)"
//   https://domrfbank.ru/stock-market/
//   "Проведение операций на рынке ценных бумаг ПАО Московская биржа
//    (клиринг НКО НКЦ (АО)) и внебиржевой рынок (клиринг НКО НРД)"
//   (account application, Регламент брокерского обслуживания, ред. 10,
//   https://domrfbank.ru/upload/docs/medialibrary/Регламент брокерского обслуживания клиентов Акционерного общества Банк ДОМ.РФ (Ред. 10).pdf)
//
// The information documents the bank hands out before an order include
// "инвестиционный пай российского биржевого паевого инвестиционного фонда"
// and "акция (пай) ETF" (same Регламент), so the exchange funds are sold.
//
// Fees: "Тарифы АО «Банк ДОМ.РФ» по брокерскому обслуживанию", "Покупка и
// продажа Ценных бумаг ... Биржевой рынок 0,032" (% of the deal), from
// 16.01.2026; the same rate as the 30.07.2025 edition.
//   https://domrfbank.ru/upload/docs/medialibrary/prilozhenie2-k-reglamentu-brokerskogo-obsluzhivaniya.pdf
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. No DOM.RF page
// leaves out a board, a segment or the funds.
//
// Yuan: the account opens "в Рублях РФ, а так же: Китайский Юань Доллар
// США Евро" (account application in the Регламент) and the tariff prices
// "Биржевой рынок (расчеты в CNY)", so the yuan books of the funds quoted
// in CNY are kept next to their rouble books.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test): that depends on the client.
//
//   node brokers/dominvest/dominvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://domrfbank.ru/stock-market/",
    lenient: true,
    phrases: ["Операции на торгах Московской биржи", "широкий спектр инструментов"],
  },
  { url: "https://domrfbank.ru/upload/docs/medialibrary/prilozhenie2-k-reglamentu-brokerskogo-obsluzhivaniya.pdf", pdf: true, lenient: true },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("dominvest-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
