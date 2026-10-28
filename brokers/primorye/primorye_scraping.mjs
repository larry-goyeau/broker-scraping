// Bank Primorye (Vladivostok, Russia) is a broker on the Moscow Exchange
// stock market, through QUIK. It publishes no instrument list. Its
// brokerage page lists "Российские акции", "Облигации" and "Фонды" as the
// securities to invest in, gives the stock-market fee and says it reaches
// no foreign venue:
//
//   "Фондовый рынок ... Комиссия Брокера от 0.035% до 0.1%"
//   "Брокер не предоставляет доступа к иностранным площадкам."
//   https://www.primbank.ru/investitsii/brokerskoe-obsluzhivanie/
//
//   Tariff in force from 15.06.2026: "Акции, облигации, РДР (с учетом
//   биржевых сборов)": «Стандарт» 0,1%, «ВИП» 0,05%, «Профессиональный
//   инвестор» 0,035% of the deal.
//   https://www.primbank.ru/d/tariffs-depo
//
// Its information documents for clients include "Инвестиционный пай
// российского биржевого паевого инвестиционного фонда" and "Акция (пай)
// ETF" (Финансовые инструменты.pdf on the brokerage page), so exchange
// funds stay in.
//
// Its regulation (reglament_okazaniya_brokerskikh_uslug.pdf) gives the
// trading system "«Фондовый рынок» ПАО Московская Биржа (ТС ФР)" and says
// the bank "не предоставляет доступ к иностранным ценным бумагам (ИЦБ), за
// исключением иностранных ценных бумаг, выпущенных и котируемых в
// соответствии с законодательством Российской Федерации ...". That is not
// a client test, so the two shares of foreign issuers on the board (OKEY
// GDR, Luxembourg; VEON, Bermuda) are left out. The same regulation opens
// the cash account "в Рублях Российской Федерации, Долларах США и
// Китайских Юанях" and the FAQ says "Банк предлагает доступ к RUB, CNY"
// (https://www.primbank.ru/investitsii/populyarnye-voprosy-brokerskoe-obsluzhivanie/),
// so the yuan books of the funds quoted in CNY are kept next to their
// rouble books.
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share and depositary receipt of a Russian (EAEU) issuer
// and every exchange fund (BPIF). Unit funds that are not ETFs (OPIF,
// IPIF, ZPIF) stay out.
//
// Restriction in broker-list.json: none.
//
//   node brokers/primorye/primorye_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, foreignIssuer, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://www.primbank.ru/investitsii/brokerskoe-obsluzhivanie/",
    lenient: true,
    phrases: ["Комиссия Брокера от 0.035% до 0.1%", "Брокер не предоставляет доступа к иностранным площадкам.", "Российские акции Облигации Фонды"],
  },
  {
    url: "https://www.primbank.ru/investitsii/populyarnye-voprosy-brokerskoe-obsluzhivanie/",
    lenient: true,
    phrases: ["Банк предлагает доступ к RUB, CNY"],
  },
  { url: "https://www.primbank.ru/d/tariffs-depo", pdf: true, lenient: true },
  { url: "https://www.primbank.ru/files/bank-uslugi/reglament_okazaniya_brokerskikh_uslug.pdf", pdf: true, lenient: true },
]);

const { rows: all, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
const rows = all.filter((row) => {
  if (!foreignIssuer(row.isin)) return true;
  left["foreign issuer: no access to foreign securities (ИЦБ)"] = (left["foreign issuer: no access to foreign securities (ИЦБ)"] || 0) + 1;
  return false;
});
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("primorye-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
