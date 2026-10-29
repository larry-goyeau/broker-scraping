// Derzhava Bank (АКБ «Держава» ПАО, Moscow) is a broker on the Moscow
// Exchange and SPB Exchange, through QUIK. It publishes no instrument list.
// Its regulation (Приложение к Договору 1, from 01.09.2026) defines the
// exchange as both:
//
//   "Биржа – ПАО Московская Биржа (МБ), ПАО «Санкт-Петербургская биржа»
//    (СПбБ)."
//   https://derzhava.ru/upload/iblock/553/ff71go5vtpzy9ev4w1lsvm97y66ntkwg/Prilozhenie-k-Dogovoru-1-REGLAMENT-utv-20260807-s-20260901.pdf
//
// Fees (Тарифы, from 01.06.2026): "Фондовый рынок (организованные торги)
// Купля/продажа ценных бумаг 0,20% от объема операций Купля/продажа ценных
// бумаг (подача Поручений в ПО QUIK) 0,10% от объема операций", with a
// minimum of 10 000 roubles a month.
//   https://derzhava.ru/upload/iblock/ded/o35n4r9uamue0g9uoetazek9jx3szio5/TARIFY-na-brok-obsluzhivanie-utv.-20260410-s-01.06.2026.pdf
//   https://derzhava.ru/securities/broker/
//
// So the catalogue is, with no list, each place's whole listing:
//   - Moscow Exchange: every admitted share, depositary receipt and
//     exchange fund (BPIF) in roubles (../sber/moexBook.mjs). Unit funds
//     that are not ETFs stay out; no yuan settlement is named, so the yuan
//     books stay out;
//   - SPB Exchange: every share and exchange fund that trades there
//     (../solid/spbBook.mjs), in roubles: the Russian segment. The foreign
//     lines are frozen since November 2023 and give no row.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the brokerage page must still list the tariffs, and the
// regulation and tariff PDFs must still be served.
//
//   node brokers/derzhava/derzhava_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { checkSpbFloors, spbCatalogue } from "../solid/spbBook.mjs";

await checkPages([
  { url: "https://derzhava.ru/securities/broker/", lenient: true, phrases: ["Брокерское обслуживание", "Тарифы"] },
  { url: "https://derzhava.ru/upload/iblock/553/ff71go5vtpzy9ev4w1lsvm97y66ntkwg/Prilozhenie-k-Dogovoru-1-REGLAMENT-utv-20260807-s-20260901.pdf", pdf: true, lenient: true },
  { url: "https://derzhava.ru/upload/iblock/ded/o35n4r9uamue0g9uoetazek9jx3szio5/TARIFY-na-brok-obsluzhivanie-utv.-20260410-s-01.06.2026.pdf", pdf: true, lenient: true },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const spb = await spbCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows, ...spb.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });
checkSpbFloors(rows);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("derzhava-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, spb: spb.left });
