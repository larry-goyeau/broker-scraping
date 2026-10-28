// Bank Levoberezhny (Novosibirsk, Russia) is a broker on the Moscow
// Exchange, through QUIK. It publishes no instrument list. Its
// investments page sells a brokerage account for securities and currency:
//
//   "Брокерский счёт — ваш доступ на биржу", "покупка валюты и ценных
//    бумаг с одного счёта"
//   https://www.nskbl.ru/private/investitsii/
//
// The tariff covers the stock and currency markets of the Moscow Exchange:
// "Тарифы Банка «Левобережный» (ПАО) ... по брокерскому обслуживанию
// физических лиц ... на фондовом и валютном рынках Московской Биржи",
// tariff «БАЗОВЫЙ» 0,04% of daily turnover up to 1 000 000 roubles, down
// to 0,01%.
//   https://www.nskbl.ru/upload/iblock/13e/8vzcpozpywnwcy1en341663nsn9rztqv/Tarify_Banka_Fondovyy_i_Valyutnyy_rynok_Moskovskoy_birzhi_fiz._litsam.pdf
//
// Its regulation (Регламент предоставления услуг на финансовых рынках,
// 14.07.2026, on /private/investitsii/brokerskoe_obsluzhivanie/) names the
// trading systems "Сектор Основного рынка Фондового рынка ПАО Московская
// Биржа" and "Валютный рынок ПАО Московская Биржа", counts "Ценные бумаги
// иностранных эмитентов" among the securities it handles, and opens
// accounts in roubles and yuan by default: "По умолчанию Клиенту
// открываются Брокерские счета в рублях РФ и Китайских юанях." It names
// no excluded board, segment or fund type.
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. The yuan books of
// the funds quoted in CNY are kept next to their rouble books, since the
// account holds yuan by default. Securities for qualified investors only
// ("Банк не принимает к исполнению Поручение Клиента, не являющегося
// квалифицированным инвестором ... на заключение сделок с ценными
// бумагами, предназначенными для квалифицированных инвесторов") depend on
// the client: foreign issuers are flagged in raw, not removed.
//
// Restriction in broker-list.json: none.
//
//   node brokers/levoberezhny/levoberezhny_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://www.nskbl.ru/private/investitsii/",
    lenient: true,
    phrases: ["Брокерский счёт — ваш доступ на биржу", "покупка валюты и ценных бумаг с одного счёта"],
  },
  {
    url: "https://www.nskbl.ru/upload/iblock/13e/8vzcpozpywnwcy1en341663nsn9rztqv/Tarify_Banka_Fondovyy_i_Valyutnyy_rynok_Moskovskoy_birzhi_fiz._litsam.pdf",
    pdf: true,
    lenient: true,
  },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("levoberezhny-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
