// Aktiv (AO Aktiv, St Petersburg, part of the DOKHOD group) is a broker on
// the Moscow Exchange, through QUIK and webQUIK. It publishes no
// instrument list. Its broker page names shares, ETFs and foreign
// securities among the products of the account:
//
//   "Открыв брокерский счет, вы получите возможность совершать операции с
//    различными инструментами, акциями и облигациями, фьючерсами и
//    опционами, ETF, Еврооблигациями." Products: "Акции и облигации",
//    "Иностранные ценные бумаги", "Валюта и драгметаллы", "БПИФ, ETF".
//   https://aktiv.ru/broker
//
// Its tariffs are priced by section of the Moscow Exchange ("Секции ПАО
// Московская Биржа": Основной рынок, Срочный рынок, Валютный рынок), e.g.
// «ДОХОДЪ-СтандартЪ» from 0,02% on the main market, «ДОХОДЪ-365» from
// 0,25%, «ДОХОДЪ-Портфель инвестора» from 0,2%.
//   https://aktiv.ru/services/tarifyi/
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. The account reaches
// the currency market (https://aktiv.ru/services/valyutniy-rinok-moskovskoy-birzhi),
// so the yuan books of the funds quoted in CNY are kept next to their
// rouble books. Aktiv names no excluded board or segment.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test).
//
//   node brokers/aktiv/aktiv_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://aktiv.ru/broker", lenient: true, phrases: ["акциями и облигациями, фьючерсами и опционами, ETF, Еврооблигациями"] },
  { url: "https://aktiv.ru/services/tarifyi/", lenient: true, phrases: ["Секции ПАО Московская Биржа Основной рынок Срочный рынок Валютный рынок"] },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("aktiv-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
