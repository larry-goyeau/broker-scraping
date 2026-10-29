// Region Broker (ООО «БК РЕГИОН», Moscow) is a broker on the Moscow
// Exchange, through QUIK and the app «РЕГИОН БРОКЕР». It publishes no
// instrument list. Its tariff (Приложение №3, for individuals from
// 11.05.2026) charges every exchange trade in securities:
//
//   "1. Тарифный план «Трейдер» ... 1.1 Совершение сделок купли/продажи
//    ценных бумаг на организованном рынке Дневной оборот ... до 999 999,99
//    руб. 0,05%"
//   https://www.region.broker/brokerskoe/tarify/
//
// So the catalogue is the Moscow Exchange equity listing
// (../sber/moexBook.mjs) in roubles: every admitted share, depositary
// receipt and exchange fund (BPIF). Unit funds that are not ETFs (OPIF,
// IPIF, ZPIF) stay out; no yuan settlement is named, so the yuan books stay
// out.
//
// SPB Exchange: broker-list.json gives it, but neither the tariff nor the
// appendices to the regulations (Свод приложений к регламентам БО, from
// 23.10.2026) name SPB Exchange, so it is left out.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the tariffs page must still list the tariff for
// individuals, and the QUIK page must still be served.
//
//   node brokers/regionbroker/regionbroker_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://www.region.broker/brokerskoe/tarify/", lenient: true, phrases: ["Приложение №3. Тарифы (физические лица, заключившие Соглашение начиная с 11.05.2026)"] },
  { url: "https://www.region.broker/brokerskoe/torgovyy-terminal-quik/", lenient: true, phrases: ["Quik"] },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("regionbroker-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left });
