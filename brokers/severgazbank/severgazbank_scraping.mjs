// Severgazbank (AO «БАНК СГБ», Vologda, Russia) is a broker on the Moscow
// Exchange stock market only, through QUIK. It publishes no instrument
// list. Its brokerage page names the market and the instruments, and the
// information documents it publishes for clients include exchange unit
// funds and ETF shares:
//
//   "Возможность торговать ценными бумагами на фондовом рынке Московской
//    Биржи."
//   "Став нашим клиентом, вы получаете возможность торговать на ведущей
//    российской бирже - Московской Бирже: - покупать и продавать акции и
//    паи"
//   https://severgazbank.ru/invest/118/36307/
//
// Fees: "Тарифы комиссионного вознаграждения Банка по брокерскому
// обслуживанию с 17.12.2024", 0,08% of the day's turnover up to
// 1 000 000 roubles, 0,05% up to 30 000 000, 0,03% above; "Тариф
// распространяется на все режимы торгов Фондового рынка ПАО Московская
// Биржа."
//   https://severgazbank.ru/upload/medialibrary/тарифы-29.11.pdf
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. No Severgazbank
// page leaves out a board, a segment or the funds.
//
// Yuan: the account application lets the client settle stock-market deals
// in a foreign currency of its choice: "2.1. в Торговой системе Фондовый
// рынок ПАО Московская Биржа (ТС ФР МБ) прошу предоставить возможность
// заключения сделок с расчетами в следующей иностранной валюте: доллар
// США евро иная валюта" (Приложение № 2б, in
// https://severgazbank.ru/upload/medialibrary/raskrytie/Prilozheniya-k-Pravilam-brokerskogo-obsluzhivaniya-AO-BANK-SGB-s-21.10.2026.zip),
// so the yuan books of the funds quoted in CNY are kept next to their
// rouble books.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw: "Для совершения сделок c иностранными ценными бумагами ...
// требуется пройти тестирование или получить статус квалифицированного
// инвестора" (key information, Приложение № 3а). That depends on the
// client, so it is a remark, not a removal.
//
//   node brokers/severgazbank/severgazbank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://severgazbank.ru/invest/118/36307/",
    lenient: true,
    phrases: [
      "Возможность торговать ценными бумагами на фондовом рынке Московской Биржи.",
      "покупать и продавать акции и паи",
      "Тарифы комиссионного вознаграждения Банка по брокерскому обслуживанию с 17.12.2024",
    ],
  },
  { url: "https://severgazbank.ru/upload/medialibrary/%D1%82%D0%B0%D1%80%D0%B8%D1%84%D1%8B-29.11.pdf", pdf: true, lenient: true },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("severgazbank-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
