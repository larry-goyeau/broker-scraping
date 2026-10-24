// Avangard Bank (Russia) is a broker on the Moscow Exchange stock market
// only, through QUIK; the account is opened at its Moscow head office.
// It publishes no instrument list. Its page names the market, and the
// information documents it asks clients to read before investing include
// exchange unit funds and ETF shares:
//
//   "Банк предлагает клиентам брокерское обслуживание на рынке акций и
//    облигаций, обращающихся на Московской бирже."
//   "Инвестиционный пай российского биржевого паевого инвестиционного
//    фонда , Акция (пай) ETF"
//   https://www.avangard.ru/rus/private/securities/brokerage_service/
//
//   "Тарифы комиссионного вознаграждения ПАО АКБ «АВАНГАРД» за оказание
//    брокерских услуг КЛИЕНТАМ на Фондовом рынке ПАО «Московская Биржа»
//    (в % от суммарного объема сделок за день)": 0,1% up to 100 000 roubles
//   a day, down to 0,015%.
//   https://www.avangard.ru/rus/private/securities/brokerage_service/tarify.pdf
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. The tariff and the
// account are in roubles and Avangard offers the stock market only (no
// currency section), so the yuan books are left out.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test).
//
//   node brokers/avangard/avangard_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://www.avangard.ru/rus/private/securities/brokerage_service/",
    lenient: true,
    phrases: [
      "Банк предлагает клиентам брокерское обслуживание на рынке акций и облигаций, обращающихся на Московской бирже.",
      "Инвестиционный пай российского биржевого паевого инвестиционного фонда",
    ],
  },
  { url: "https://www.avangard.ru/rus/private/securities/brokerage_service/tarify.pdf", pdf: true, lenient: true },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("avangard-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
