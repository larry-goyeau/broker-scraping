// Svoi Investitsii (Россельхозбанк, Moscow) is the bank's brokerage, through
// the app «Свои Инвестиции» and QUIK. It publishes no instrument list. Its
// brokerage page:
//
//   "Мы предоставляем доступ к Московской Бирже и СПБ Бирже. С брокерским
//    счетом в Россельхозбанке вам доступны: Фондовый рынок Московской Биржи:
//    акции, облигации, еврооблигации, ETF / БПИФ"
//   "Выберите биржевые инструменты и приобретите их онлайн или по телефону"
//   https://www.rshb.ru/natural/brokerage
//
// Fees: "Инвестор ... Фондовый рынок Московской биржи и СПБ биржи (с учётом
// комиссии биржи) 0,18%"; "Трейдер ... 0,055%".
//   https://www.rshb.ru/natural/brokerage/info/tarif
//
// So the catalogue is, with no list, each place's whole listing:
//   - Moscow Exchange: every admitted share, depositary receipt and
//     exchange fund (BPIF) in roubles (../sber/moexBook.mjs). Unit funds
//     that are not ETFs stay out; no yuan settlement of securities is
//     named, so the yuan books stay out;
//   - SPB Exchange: every share and exchange fund that trades there
//     (../solid/spbBook.mjs), in roubles: the Russian segment. The foreign
//     lines are frozen since November 2023 and give no row.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: both pages must still carry the lines above.
//
//   node brokers/svoiinvest/svoiinvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { checkSpbFloors, spbCatalogue } from "../solid/spbBook.mjs";

await checkPages([
  { url: "https://www.rshb.ru/natural/brokerage", lenient: true, phrases: ["Мы предоставляем доступ к Московской Бирже и СПБ Бирже"] },
  { url: "https://www.rshb.ru/natural/brokerage/info/tarif", lenient: true, phrases: ["Фондовый рынок Московской биржи и СПБ биржи"] },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const spb = await spbCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows, ...spb.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });
checkSpbFloors(rows);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("svoiinvest-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, spb: spb.left });
