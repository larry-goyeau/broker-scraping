// IFC Solid (АО ИФК «Солид», Moscow) is a broker on the Moscow Exchange and
// SPB Exchange, through its app «Солид Инвестор» and QUIK. It publishes no
// instrument list. Its tariff plan names both exchanges and charges every
// share and bond trade:
//
//   "Тарифный план SOLID PRO ... Доступные площадки: Фондовый, валютный и
//    срочный рынок Московской биржи, Санкт-Петербургская биржа Терминалы,
//    включенные в тариф: Приложение «Солид Инвестор», терминал QUIK
//    (бесплатно) ... Ценные бумаги (Акции, Облигации) За сделки вне
//    зависимости от оборота за день 0,25%"
//   https://solidinvest.ru/upload/iblock/1d8/ge6oyf4frr0mq8xumi7gmod9i39pec7j/Tarifnyy-plan-Solid-Pro.pdf
//   https://solidinvest.ru/tariffs/fondovyy_rynok_moskovskoy_birzhi
//   https://solidinvest.ru/tariffs/sankt-peterburgskaya_birzha  (SPB tariff page)
//
// So the catalogue is, with no list, each place's whole listing:
//   - Moscow Exchange: every admitted share, depositary receipt and
//     exchange fund (BPIF) in roubles (../sber/moexBook.mjs). Solid's
//     tariff names no settlement in another currency, so the yuan and
//     dollar books of the funds stay out; unit funds that are not ETFs
//     (OPIF, IPIF, ZPIF) stay out;
//   - SPB Exchange: every share and exchange fund that trades there
//     (./spbBook.mjs): the Russian segment in roubles. The foreign lines
//     are frozen since November 2023 and give no row.
//
// Restriction in broker-list.json: "Foreign (non-EAEU) securities for
// qualified investors only". That is the Russian rule for unqualified
// investors (the broker-list source is the app user guide); it depends on
// the client, not on the title, so it is not a filter: the foreign-issuer
// lines are flagged in raw.
//
// Run-time checks: the tariff pages must still name both exchanges and the
// percentage commission, and the Solid Pro PDF must still be served.
//
//   node brokers/solid/solid_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { checkSpbFloors, spbCatalogue } from "./spbBook.mjs";

await checkPages([
  {
    url: "https://solidinvest.ru/tariffs/sankt-peterburgskaya_birzha",
    lenient: true,
    phrases: ["Фондовый рынок Московской биржи", "Санкт-Петербургская биржа", "Комиссия за брокерское обслуживание указана в % от суммы сделки"],
  },
  { url: "https://solidinvest.ru/upload/iblock/1d8/ge6oyf4frr0mq8xumi7gmod9i39pec7j/Tarifnyy-plan-Solid-Pro.pdf", pdf: true, lenient: true },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const spb = await spbCatalogue({ currencies: ["RUB"] });
const rows = [...moex.rows, ...spb.rows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });
checkSpbFloors(rows);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("solid-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, spb: spb.left });
