// Chelyabinvestbank (Chelinvest, Chelyabinsk, Russia) is a broker on the
// Moscow Exchange, through QUIK MP "Брокер" or paper orders. It publishes
// no instrument list. Its brokerage page:
//
//   "Челябинвестбанк осуществляет брокерское обслуживание Клиентов при
//    покупке-продаже ценных бумаг на Организованном Рынке Ценных Бумаг
//    (ОРЦБ)", "прямой доступ к торговой площадке Московской Биржи".
//   https://chelinvest.ru/investment/brokerskie-uslugi/
//
//   Tariffs for individuals, section 12.4 "Брокерское обслуживание по
//   операциям на организованном рынке ценных бумаг (ОРЦБ)": «ИГРОК»
//   (QUIK access to ПАО Московская Биржа) 0,075% of daily turnover up to
//   1 million roubles, down to 0,045%; «ИНВЕСТОР» (paper orders) 0,10% to
//   0,08%.
//   https://chelinvest.ru/tarify/ (GU_tariffs_fizl_21-10-2026,
//   /upload/iblock/952/n7t1oqkyv20vt5ey8gs4fyidx2jg34dv.pdf)
//
// Its brokerage rules (Правила предоставления брокерских услуг, редакция
// №4 from 01.04.2026, on the brokerage page) define "Биржа" as ПАО
// «Московская Биржа" and say, in the risk declaration annex:
//
//   "ПАО «ЧЕЛЯБИНВЕСТБАНК» не оказывает своим клиентам услуги по
//    приобретению паев паевых инвестиционных фондов."
//
// Every exchange fund on the Moscow Exchange is a unit of a BPIF (SECTYPE
// J), so the exchange funds are left out, and so are the other unit funds
// (OPIF, IPIF, ZPIF). The catalogue is every admitted share and
// depositary receipt of the Moscow Exchange equity listing (moexBook.mjs),
// in roubles (all shares are quoted in RUB). The rules carry the foreign
// securities risk declaration, so foreign issuers stay in, flagged in raw
// (qualified investors, or the test).
//
// Restriction in broker-list.json: none.
//
//   node brokers/chelinvest/chelinvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://chelinvest.ru/investment/brokerskie-uslugi/",
    lenient: true,
    phrases: [
      "прямой доступ к торговой площадке Московской Биржи",
      "12.4. «Брокерское обслуживание по операциям на организованном рынке ценных бумаг (ОРЦБ)»",
    ],
  },
  { url: "https://chelinvest.ru/upload/iblock/952/n7t1oqkyv20vt5ey8gs4fyidx2jg34dv.pdf", pdf: true, lenient: true },
  { url: "https://chelinvest.ru/upload/iblock/0f8/r9givqi1pjyk0ou5hhqjebpafkle4kx0.pdf", pdf: true, lenient: true },
]);

const { rows: all, left } = await moexCatalogue({ currencies: ["RUB"] });
const rows = all.filter((row) => {
  if (row.type !== "ETF") return true;
  left["exchange fund (BPIF): the bank sells no fund units"] = (left["exchange fund (BPIF): the bank sells no fund units"] || 0) + 1;
  return false;
});
checkFloors(rows, { etfs: 0, anchors: ANCHORS });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("chelinvest-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
