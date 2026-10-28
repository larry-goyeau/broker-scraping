// KIT Finance (AO, St Petersburg) is a broker on the Moscow Exchange: the
// stock, derivatives, currency and precious-metals markets, through QUIK
// and the KIT Investitsii app. It publishes no list of what the app
// offers, so the catalogue is the Moscow Exchange equity listing
// (../sber/moexBook.mjs): every admitted share, depositary receipt and
// exchange fund (BPIF). Unit funds that are not ETFs (OPIF, IPIF, ZPIF)
// stay out.
//
//   "Биржи и инструменты Ценные бумаги Акции Облигации Московская Биржа,
//    фондовый рынок: акции, облигации" ... "Валюта Юани Московская Биржа,
//    валютный рынок"
//   "Мобильное приложение КИТ Инвестиции Удобно отслеживать изменение
//    котировок, легко совершать сделки с инструментами, которые торгуются
//    на Московской бирже"
//   https://brokerkf.ru/invest/start/
//
// Fees: "КИТ-Универсал" "Фондовый рынок Мосбиржи от 0,02% от суммы
// сделки", no monthly fee ("Абонентская плата Отсутствует").
//   https://brokerkf.ru/tariffs/
//
// Currency: the account buys yuan on the Moscow Exchange currency market
// (above), so the yuan books of the funds quoted in CNY are kept next to
// their rouble books.
//
// Exchange funds: no page excludes them. The FinEx funds the FAQ talks
// about were delisted from the Moscow Exchange and are not in the book.
//   https://brokerkf.ru/support/faq/
//
// Restriction in broker-list.json: "Foreign (non-EAEU) securities for
// qualified investors only". It depends on the client, not the title, so
// foreign issuers are flagged in raw instead of dropped.
//
//   node brokers/kitfinance/kitfinance_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://brokerkf.ru/invest/start/",
    lenient: true,
    phrases: [
      "Московская Биржа, фондовый рынок: акции, облигации",
      "Валюта Юани Московская Биржа, валютный рынок",
      "легко совершать сделки с инструментами, которые торгуются на Московской бирже",
    ],
  },
  { url: "https://brokerkf.ru/tariffs/", lenient: true, phrases: ["Фондовый рынок Мосбиржи от 0,02% от суммы сделки"] },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("kitfinance-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
