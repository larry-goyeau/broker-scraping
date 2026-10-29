// Koshelev Bank (АО «Кошелев-Банк», Samara) is a broker on the Moscow
// Exchange and SPB Exchange, through QUIK. It publishes no instrument list.
// Each tariff plan on its brokerage page prices both stock markets, e.g.
// «Инвестор»:
//
//   "Комиссионное вознаграждение, действующее для сделок с ценными бумагами
//    на Фондовом рынке ПАО Московская биржа, кроме сделок с еврооблигациями
//    Объем сделок по итогам торгового дня, руб ... до 100 000 0,09%"
//   "Комиссионное вознаграждение, действующее для сделок с ценными бумагами
//    на Фондовом рынке ПАО Санкт-Петербургская биржа Любой оборот 0,15%"
//   https://www.koshelev-bank.ru/investments/broking/
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
// Run-time check: the brokerage page must still price both stock markets.
//
//   node brokers/koshelevbank/koshelevbank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { checkSpbFloors, spbCatalogue } from "../solid/spbBook.mjs";

await checkPages([
  { url: "https://www.koshelev-bank.ru/investments/broking/", lenient: true, phrases: ["на Фондовом рынке ПАО Московская биржа", "на Фондовом рынке ПАО Санкт-Петербургская биржа"] },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const spb = await spbCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows, ...spb.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });
checkSpbFloors(rows);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("koshelevbank-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, spb: spb.left });
