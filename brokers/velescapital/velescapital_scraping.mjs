// Veles Capital (ООО «ИК ВЕЛЕС Капитал», Moscow) is a broker on the Moscow
// Exchange and SPB Exchange, through its app «ВЕЛЕС Инвестиции» and QUIK.
// Its regulation (Регламент осуществления брокерской деятельности, from
// 14.08.2026) names both and leaves the instrument list to the terminal:
//
//   "... в следующих Торговых системах: ▪ ПАО Московская Биржа: Сектор
//    фондового рынка; ... ▪ ПАО «СПБ Биржа». Компания самостоятельно
//    определяет перечень ценных бумаг ... Перечень доступных ценных бумаг
//    и иных финансовых инструментов доводится до Клиента через Систему
//    интернет-трейдинга."
//   https://veles-capital.ru/upload/iblock/7ba/1j9kfpt88czqej252nt3clb9uneu2xao.pdf
//   https://veles-capital.ru/about/information/
//
// That list is only shown after login, so each place is taken whole.
//
// Fees: "Тарифный план «Универсальный +» Стандартный тарифный план ..." exchange
// trades "до 5 000 000 0,05" % of daily turnover, down to 0,015 %.
//   https://veles-capital.ru/products/tarifi/
//
// Catalogue:
//   - Moscow Exchange: every admitted share, depositary receipt and
//     exchange fund (BPIF) in roubles (../sber/moexBook.mjs). Unit funds
//     that are not ETFs stay out; no yuan settlement is named, so the yuan
//     books stay out;
//   - SPB Exchange: every share and exchange fund that trades there
//     (../solid/spbBook.mjs), in roubles: the Russian segment. The foreign
//     lines are frozen since November 2023 and give no row.
//
// The regulation gives SPB to individuals only if they let the broker use
// their assets or are qualified investors ("Компания не предоставляет
// доступ к организованном торгам на ПАО «СПБ Биржа» клиентам-физическим
// лицам, не предоставившим Компании права использования ..."). That depends
// on the client's contract, not on the title, so it is not a filter; the SPB
// rows carry it in raw.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the tariffs page must still list the Универсальный +
// plan, and the regulation PDF must still be served.
//
//   node brokers/velescapital/velescapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { checkSpbFloors, spbCatalogue } from "../solid/spbBook.mjs";

await checkPages([
  { url: "https://veles-capital.ru/products/tarifi/", lenient: true, phrases: ["Тарифный план «Универсальный +»"] },
  { url: "https://veles-capital.ru/upload/iblock/7ba/1j9kfpt88czqej252nt3clb9uneu2xao.pdf", pdf: true, lenient: true },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const spb = await spbCatalogue({ currencies: ["RUB"], notes: ["Veles: SPB only for individuals who let the broker use their assets, or qualified investors"] });
const rows = [...moex.rows, ...spb.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });
checkSpbFloors(rows);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("velescapital-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, spb: spb.left });
