// CentroCredit (АО АКБ «ЦентроКредит», Moscow) is a broker on the Moscow
// Exchange, through QUIK and TRANSAQ. It publishes no instrument list. Its
// "Онлайн" tariff charges every exchange trade in securities:
//
//   "Тариф на брокерское обслуживание "Онлайн" ... Покупка/продажа ценных
//    бумаг на организованном рынке Оборот за день (2) в рублях Процент от
//    оборота от 0.01 до 4 999 999.99 0.02%"
//   https://www.ccb.ru/services/tariffs/online/
//
// Its regulation (Регламент брокерского обслуживания, on
// https://www.ccb.ru/about/info/) names the SPB Exchange but suspends it:
//
//   "Торгах иностранными ценными бумагами ПАО «СПБ Биржа» (предоставление
//    доступа приостановлено, отдельные операции могут быть проведены в
//    индивидуальном порядке после предварительного согласования)"
//   https://www.ccb.ru/download/doc/brok/b_260323_01.pdf
//
// So SPB Exchange (in broker-list.json) is left out: access is suspended and
// only arranged case by case, not online. The catalogue is the Moscow
// Exchange equity listing (../sber/moexBook.mjs) in roubles: every admitted
// share, depositary receipt and exchange fund (BPIF). The tariff names no
// settlement of securities in another currency, so the yuan books of the
// funds stay out; unit funds that are not ETFs (OPIF, IPIF, ZPIF) stay out.
//
// The regulation (5.14) opens foreign securities on the Moscow Exchange to
// clients without US tax residence; that depends on the client, so the
// foreign-issuer lines stay and are flagged in raw.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the online tariff page must still carry the line above,
// and the regulation PDF must still be served.
//
//   node brokers/centrocredit/centrocredit_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://www.ccb.ru/services/tariffs/online/", lenient: true, phrases: ["Покупка/продажа ценных бумаг на организованном рынке"] },
  { url: "https://www.ccb.ru/download/doc/brok/b_260323_01.pdf", pdf: true, lenient: true },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("centrocredit-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left });
