// UBRR (ПАО КБ «УБРиР», Yekaterinburg) is a broker on the Moscow Exchange,
// through QUIK. Its markets page:
//
//   "«ПАО КБ «УБРиР» предоставляет доступ к торговле всеми инструментами,
//    обращающимися на Московской бирже : Фондовый рынок Московской биржи :
//    акции российских и иностранных эмитентов; облигации ; еврооблигации ;
//    ETF ."
//   https://www.ubrr.ru/investoram/treyding/torgovye-ploshchadki-i-instrumenty
//
// Fees: "Тарифный план «Единый» ... Ставка комиссионного вознаграждения,
// applied on the Фондовый рынок МБ ... до 1 000 000 рублей ... 0,06%";
// "«Единый лайт» ... 0,3%".
//   https://www.ubrr.ru/investoram/treyding/tarify-torgovye
//
// So the catalogue is the Moscow Exchange equity listing
// (../sber/moexBook.mjs) in roubles: every admitted share (Russian and
// foreign issuers), depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out, and so do the yuan
// books (no yuan settlement named).
//
// SPB Exchange: broker-list.json gives it, but UBRR's pages name only the
// Moscow Exchange ("всеми инструментами, обращающимися на Московской
// бирже"), so it is left out.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: both pages must still carry the lines above.
//
//   node brokers/ubrr/ubrr_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://www.ubrr.ru/investoram/treyding/torgovye-ploshchadki-i-instrumenty", lenient: true, phrases: ["предоставляет доступ к торговле всеми инструментами, обращающимися на Московской бирже"] },
  { url: "https://www.ubrr.ru/investoram/treyding/tarify-torgovye", lenient: true, phrases: ["Тарифный план «Единый»"] },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("ubrr-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left });
