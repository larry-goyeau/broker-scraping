// Bank Sinara (АО Банк Синара, Yekaterinburg) is a broker on the Moscow
// Exchange, through QUIK (desktop, iQUIK X, QUIK Android X). It publishes no
// instrument list. Its tariffs page charges exchange trades:
//
//   "Первый ... Комиссия за сделки на фондовом рынке от 0.005% до 0.05% от
//    оборота в зависимости от размера оборота / суммы активов"
//   https://sinara-finance.ru/tariffs/
//   https://sinara-finance.ru/trading-systems   (QUIK, information documents
//   for shares, depositary receipts and exchange-fund units)
//
// So the catalogue is the Moscow Exchange equity listing
// (../sber/moexBook.mjs) in roubles: every admitted share, depositary
// receipt and exchange fund (BPIF). Unit funds that are not ETFs (OPIF,
// IPIF, ZPIF) stay out; nothing on Sinara's pages names settlement of
// securities in yuan, so the yuan books stay out.
//
// SPB Exchange: broker-list.json gives it (from the QUIK Android user
// guide), but no Sinara tariff or service page names SPB Exchange, and the
// bank's disclosure pages are behind a script, so it is left out.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the tariffs and trading-systems pages must still carry
// the lines above.
//
//   node brokers/banksinara/banksinara_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://sinara-finance.ru/tariffs/", lenient: true, phrases: ["Комиссия за сделки на фондовом рынке"] },
  { url: "https://sinara-finance.ru/trading-systems", lenient: true, phrases: ["Рабочее место QUIK"] },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("banksinara-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left });
