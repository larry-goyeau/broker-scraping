// Ricom-Trust (ИК «РИКОМ-ТРАСТ», Moscow) is a broker on the Moscow Exchange
// and SPB Exchange; "Все операции доступны в онлайн режиме"
// (https://www.ricom.ru/). It publishes no instrument list. Its tariff page
// prices both places:
//
//   "Тариф «Стратег» ... Фондовый биржевой рынок Ставка комиссионного
//    вознаграждения Брокеру 0,3% от суммы сделки ... Рынок иностранных акций
//    на СПб Ставка комиссионного вознаграждения Брокеру 0,3% от суммы
//    сделки"
//   https://www.ricom.ru/tariffs/
//   https://www.ricom.ru/media/docs/br_archive/Broker_regulations-20-10-2026.pdf
//   (regulation: "Все комиссии Брокера по операциям с иностранными ЦБ на ПАО
//   “Санкт-Петербургская биржа” ... списываются в рублях")
//
// So the catalogue is, with no list, each place's whole listing:
//   - Moscow Exchange: every admitted share, depositary receipt and
//     exchange fund (BPIF) in roubles (../sber/moexBook.mjs). Unit funds
//     that are not ETFs stay out; no yuan settlement is named, so the yuan
//     books stay out;
//   - SPB Exchange: only the foreign-shares market ("Рынок иностранных
//     акций на СПб"), read from ../solid/spbBook.mjs. Those lines are frozen
//     since November 2023, so it gives no row today. The Russian segment of
//     SPB is not in Ricom's tariff and is left out.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the tariff page must still carry both lines, and the
// regulation PDF must still be served.
//
//   node brokers/ricom/ricom_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { checkSpbFloors, spbCatalogue } from "../solid/spbBook.mjs";

await checkPages([
  { url: "https://www.ricom.ru/tariffs/", lenient: true, phrases: ["Фондовый биржевой рынок", "Рынок иностранных акций на СПб"] },
  { url: "https://www.ricom.ru/media/docs/br_archive/Broker_regulations-20-10-2026.pdf", pdf: true, lenient: true },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
// Foreign segment only (see the header): no row while those boards are frozen.
const spb = await spbCatalogue({ currencies: null, segments: ["eng"] });
const rows = [...moex.rows, ...spb.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("ricom-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, spb: spb.left });
