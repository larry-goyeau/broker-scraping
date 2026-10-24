// TRINFICO (Russia) is a broker on the Moscow Exchange, through its app
// and QUIK. It publishes no instrument list and says every instrument can
// be traded online:
//
//   "Все инструменты доступны онлайн"
//   https://trinfico.ru/
//
//   "Совершение Сделок на организованных торгах через мобильное приложение"
//   (0.01% of the deal) and "через систему QUIK" (0.12% down to 0.01% by
//   daily turnover), tariffs in force from 02.07.2026.
//   https://trinfico.ru/tariffs/
//
// Its full tariff names the exchange ("Торговых площадках ПАО «Московская
// биржа»", Тарифы ТРФ 02 07 2026.pdf), its key-information document names
// the Moscow Exchange currency market ("валютном рынке ПАО Московская
// Биржа", КИД ТРФ 2026.pdf), and its information documents for clients
// include the BPIF unit and the ETF share
// (https://trinfico.ru/disclosure/dokumenty-brokera/).
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. The account reaches
// the currency market, so the yuan books of the funds quoted in CNY are
// kept next to their rouble books.
//
// SPB Exchange: TRINFICO is a member (its list of trading organisers names
// ПАО "СПБ Биржа"), but no client page offers it and broker-list.json
// gives only the Moscow Exchange, so it is left out.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test).
//
//   node brokers/trinfico/trinfico_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://trinfico.ru/", phrases: ["Все инструменты доступны онлайн"] },
  { url: "https://trinfico.ru/tariffs/", phrases: ["Совершение Сделок на организованных торгах через мобильное приложение"] },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("trinfico-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
