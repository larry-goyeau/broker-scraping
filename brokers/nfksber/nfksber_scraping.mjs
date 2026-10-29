// NFK-Sberezheniya (ПАО «НФК-Сбережения», Moscow) is a broker on the Moscow
// Exchange and SPB Exchange, through QUIK and its online shop. It publishes
// no instrument list for exchange trading. Its tariffs page prices both:
//
//   "Комиссия от оборота по сделкам, совершенным на рынках Московской Биржи
//    и Санкт-Петербургской биржи от 0,006% до 0,025% 0,2%"
//   "... совершение в интересах Клиента 100 и более сделок с ценными
//    бумагами на торгах в секции фондового рынка ПАО «Московская биржа»
//    и/или ПАО «Санкт-Петербургская биржа» ..."
//   https://nfksber.ru/tariff/
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
// Run-time check: the tariffs page must still price both exchanges.
//
//   node brokers/nfksber/nfksber_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { checkSpbFloors, spbCatalogue } from "../solid/spbBook.mjs";

await checkPages([
  { url: "https://nfksber.ru/tariff/", lenient: true, phrases: ["на рынках Московской Биржи и Санкт-Петербургской биржи"] },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const spb = await spbCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows, ...spb.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });
checkSpbFloors(rows);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("nfksber-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, spb: spb.left });
