// Loko-Bank (КБ «ЛОКО-Банк» (АО), Moscow) is a broker on the Moscow
// Exchange, through QUIK. Its brokerage page:
//
//   "КБ «ЛОКО-Банк» (АО) предоставляет брокерские услуги на рынке ценных
//    бумаг: На ПАО Московская Биржа (фондовый, денежный рынки); На
//    внебиржевом рынке."
//   https://www.lockobank.ru/broker-service/
//
// Fees, Приложение 4 к Регламенту (Тарифы): "1. На Фондовом рынке ПАО
// Московская Биржа (кроме сделок РЕПО) 1.1. Тарифный план «Ежедневный» ...
// до 5 000 000 0,2%, минимум 250 руб."
//   https://www.lockobank.ru/cms/prod/Prilozhenie_4_k_Reglamentu_Tarify_v1_e0589afca5.pdf
// The tariff also charges access to QUIK (Приложение 13: "Порядок
// обслуживания Клиентов в ИТС QUIK").
//
// So the catalogue is the Moscow Exchange equity listing
// (../sber/moexBook.mjs) in roubles: every admitted share, depositary
// receipt and exchange fund (BPIF). Unit funds that are not ETFs (OPIF,
// IPIF, ZPIF) stay out; the tariff takes commissions in roubles and names
// no yuan settlement, so the yuan books stay out.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the brokerage page must still carry the sentence above,
// and the tariff PDF must still be served.
//
//   node brokers/lokobank/lokobank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://www.lockobank.ru/broker-service/", lenient: true, phrases: ["На ПАО Московская Биржа (фондовый, денежный рынки)"] },
  { url: "https://www.lockobank.ru/cms/prod/Prilozhenie_4_k_Reglamentu_Tarify_v1_e0589afca5.pdf", pdf: true, lenient: true },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("lokobank-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left });
