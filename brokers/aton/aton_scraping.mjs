// Aton (ООО «АТОН», Moscow) is a broker on the Moscow Exchange, through
// QUIK and its app ATON Line. It publishes no instrument list. Its tariffs
// page:
//
//   "Первый тариф дает доступ к инфраструктуре, позволяя самостоятельно
//    торговать на Московской бирже."
//   "Первый Нет порога входа ... Комиссия за сделку с ценными бумагами
//    Самостоятельная торговля (QUIK, ATON Line) 0,095%"
//   https://www.aton.ru/rates/
//
// So the catalogue is the Moscow Exchange equity listing
// (../sber/moexBook.mjs) in roubles: every admitted share, depositary
// receipt and exchange fund (BPIF). Unit funds that are not ETFs (OPIF,
// IPIF, ZPIF) stay out; no yuan settlement is named, so the yuan books stay
// out.
//
// SPB Exchange: broker-list.json gives it, and the same page says Aton
// "является участником торгов ПАО «Московская Биржа» и ПАО
// «Санкт-Петербургская биржа»", but that is membership: the self-directed
// tariff offers trading on the Moscow Exchange only, so SPB is left out.
// The other three plans are for qualified investors with a financial
// adviser and change only the rate.
//
// Restriction in broker-list.json: none.
//
// Run-time check: the tariffs page must still carry the lines above.
//
//   node brokers/aton/aton_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://www.aton.ru/rates/", lenient: true, phrases: ["позволяя самостоятельно торговать на Московской бирже", "Самостоятельная торговля (QUIK, ATON Line)"] },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("aton-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left });
