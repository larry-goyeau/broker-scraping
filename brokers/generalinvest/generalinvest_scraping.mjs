// General Invest (ООО Концерн «ДЖЕНЕРАЛ-ИНВЕСТ», Moscow) is a broker on the
// Moscow Exchange and SPB Exchange, through its app General Invest and its
// online cabinet. It publishes no instrument list. Its tariff (Приложение
// №28 к Регламенту, from 01.09.2026) prices both stock markets at one rate:
//
//   "Фондовый рынок ПАО Московская Биржа (ФР МБ), фондовый рынок ПАО «СПБ
//    Биржа» (ФР СПБ) ... Сделки на ФР МБ, ФР СПБ и ВР МБ, кроме сделок с
//    драгоценными металлами 0,35% от суммы сделки"
//   https://generalinvest.ru/docs/Tarify_01092026.pdf
//   https://generalinvest.ru/brokerage_services.html
//
// So the catalogue is, with no list, each place's whole listing:
//   - Moscow Exchange: every admitted share, depositary receipt and
//     exchange fund (BPIF) in roubles (../sber/moexBook.mjs). Unit funds
//     that are not ETFs stay out; no yuan settlement is named, so the yuan
//     books stay out;
//   - SPB Exchange: every share and exchange fund that trades there
//     (../solid/spbBook.mjs), in roubles: the Russian segment. The foreign
//     lines are frozen since November 2023 and give no row.
// The foreign securities General Invest sells over the counter through
// upstream brokers in Armenia (named on the brokerage page) are OTC, not
// exchange orders, and are not added.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the brokerage page must still link the tariff, and the
// tariff PDF must still be served.
//
//   node brokers/generalinvest/generalinvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { checkSpbFloors, spbCatalogue } from "../solid/spbBook.mjs";

await checkPages([
  { url: "https://generalinvest.ru/brokerage_services.html", lenient: true, phrases: ["Тарифы брокерского обслуживания"] },
  { url: "https://generalinvest.ru/docs/Tarify_01092026.pdf", pdf: true, lenient: true },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const spb = await spbCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows, ...spb.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });
checkSpbFloors(rows);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("generalinvest-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, spb: spb.left });
