// SberInvestor (Sberbank, Russia) sells the securities of the Moscow
// Exchange. Sber publishes no instrument list of its own; its brokerage
// tariff charges every security bought or sold on the Moscow Exchange,
// with a line for exchange funds, including those settled in a foreign
// currency:
//
//   "1.1 Покупка и продажа ценных бумаг на ПАО Московская биржа"
//   "1.4. Покупка и продажа биржевых паевых фондов ... с расчётами в
//    иностранной валюте 0,03%"
//   "Комиссия бирж по сделкам с расчётами в китайских юанях ... не взимается."
//   https://www.sberbank.com/common/img/uploaded/broker/tariff_self.pdf
//   (tariff «Самостоятельный», in force from 14.07.2025)
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. Yuan settlement is
// in the tariff, so the yuan books of the funds quoted in CNY are kept
// next to their rouble books; no other currency is listed on these boards.
//
// SPB Exchange: the tariff names only the Moscow Exchange, and
// broker-list.json gives Sber no other place. Nothing else is added.
//
// Restriction in broker-list.json: "Foreign (non-EAEU) securities for
// qualified investors only". sberbank.ru answers scripted requests with a
// WAF block page, so it could not be read on Sber's pages; it depends on
// the client (qualified status, or the test for unqualified investors),
// not on the title, so it is not a filter: the foreign-issuer lines (two
// on the main board today) are flagged in raw.
//
// Run-time check: the tariff PDF must still be served (its text is not
// parsed here).
//
//   node brokers/sber/sber_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "./moexBook.mjs";

await checkPages([{ url: "https://www.sberbank.com/common/img/uploaded/broker/tariff_self.pdf", pdf: true, lenient: true }]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("sber-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
