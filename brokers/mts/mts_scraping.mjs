// MTS Investments (the investment app of PJSC MTS Bank, Russia) sells
// shares, bonds and exchange funds of the Moscow Exchange. Its list is
// only in the app, so the catalogue is the Moscow Exchange equity listing
// (../sber/moexBook.mjs): every admitted share, depositary receipt and
// exchange fund (BPIF). Unit funds that are not ETFs (OPIF, IPIF, ZPIF)
// stay out.
//
//   "Вы можете торговать акциями, облигациями и паями БПИФ на Московской
//    бирже. Список ценных бумаг и фондов есть в приложении МТС Инвестиции
//    на вкладке Что купить."
//   https://support.mts.ru/invetitsii/brokerskii-schyot/tsennie-bumagi-i-operatsii-s-nimi
//
// Fees: "Базовый" "0,3% комиссии за сделки, но минимум 5 ₽"; "Смарт
// подписка" 299 roubles a month, "0,04% за сделки с акциями и облигациями".
//   https://support.mts.ru/invetitsii/brokerskii-schyot/kakie-est-tarifi-v-mts-investitsiyah
//
// Currency: the account trades currency on the exchange ("Брокерский счёт
// — это специальный счёт для торговли ценными бумагами и валютой на
// бирже"; "Как купить ценные бумаги и валюту"), so the yuan books of the
// funds quoted in CNY are kept next to their rouble books.
//   https://support.mts.ru/invetitsii/brokerskii-schyot/obschaya-informatsiya-po-brokerskomu-schyotu-v-mts-investitsiyah
//
// Nothing else is excluded on these pages. Some lines need the
// unqualified-investor test ("Для покупки некоторых бумаг нужно пройти
// тест"); that depends on the client, so it is a remark, not a removal.
// Restriction in broker-list.json: "Foreign (non-EAEU) securities for
// qualified investors only", also client-dependent: foreign issuers are
// flagged in raw instead of dropped.
//
//   node brokers/mts/mts_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

const HELP = "https://support.mts.ru/invetitsii/brokerskii-schyot/";

await checkPages([
  {
    url: `${HELP}tsennie-bumagi-i-operatsii-s-nimi`,
    lenient: true,
    phrases: [
      "Вы можете торговать акциями, облигациями и паями БПИФ на Московской бирже.",
      "Список ценных бумаг и фондов есть в приложении МТС Инвестиции на вкладке Что купить",
      "Как купить ценные бумаги и валюту",
    ],
  },
  {
    url: `${HELP}kakie-est-tarifi-v-mts-investitsiyah`,
    lenient: true,
    phrases: ["0,3% комиссии за сделки, но минимум 5 ₽", "0,04% за сделки с акциями и облигациями"],
  },
  {
    url: `${HELP}obschaya-informatsiya-po-brokerskomu-schyotu-v-mts-investitsiyah`,
    lenient: true,
    phrases: ["специальный счёт для торговли ценными бумагами и валютой на бирже"],
  },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("mts-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
