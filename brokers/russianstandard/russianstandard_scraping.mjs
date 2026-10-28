// Russian Standard Bank (АО «Банк Русский Стандарт», Russia) is a broker
// on the Moscow Exchange. It publishes no instrument list:
//
//   "АО «Банк Русский Стандарт» осуществляет брокерское обслуживание на
//    рынке ценных бумаг."
//   https://www.rsb.ru/securities-investments/brokerage-service/
//   "Брокер совершает сделки с ценными бумагами, не являющиеся
//    производными финансовыми инструментами, на торгах ПАО «Московская
//    Биржа» или на Внебиржевом рынке." (Регламент, version 11.0, 8.2.8)
//   https://www.rsb.ru/upload/iblock/44d/44dbe5a5359ce48ee11549fdef54dc1c.pdf
//
// Fees: tariff «Стандарт», "Тарифы за совершение сделок с ценными
// бумагами ... на торгах ПАО "Московская Биржа" ... 0,15% от суммы сделки
// (части сделки), но не менее 150 руб. за каждый день исполнения сделок"
// (in force since 05.11.2025).
//   https://www.rsb.ru/upload/iblock/526/526e9ab52682ba2ec7f613638a0f7216.pdf
//
// What it does not sell: the Регламент lists the services the broker does
// not provide, among them
//   "совершение сделок за счет Клиента с иностранной валютой;"
//   "совершение сделок по приобретению паев паевых инвестиционных фондов,
//    паев/акций ETF;" (Регламент, 1.13)
// So the exchange funds (BPIF and foreign ETFs) are left out, and with no
// currency deals the account is in roubles: rouble lines only.
//
// The catalogue is the Moscow Exchange share listing (moexBook.mjs): every
// admitted share and depositary receipt quoted in roubles. Unit funds that
// are not ETFs (OPIF, IPIF, ZPIF) stay out as well.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test): that depends on the client.
//
//   node brokers/russianstandard/russianstandard_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://www.rsb.ru/securities-investments/brokerage-service/",
    lenient: true,
    phrases: ["АО «Банк Русский Стандарт» осуществляет брокерское обслуживание на рынке ценных бумаг.", "Тарифы на брокерские услуги"],
  },
  { url: "https://www.rsb.ru/upload/iblock/526/526e9ab52682ba2ec7f613638a0f7216.pdf", pdf: true, lenient: true },
  { url: "https://www.rsb.ru/upload/iblock/44d/44dbe5a5359ce48ee11549fdef54dc1c.pdf", pdf: true, lenient: true },
]);

const { rows: all, left } = await moexCatalogue({ currencies: ["RUB"] });
const rows = all.filter((row) => {
  if (row.type === "STOCK") return true;
  left["exchange fund: the Регламент excludes buying BPIF and ETF units"] = (left["exchange fund: the Регламент excludes buying BPIF and ETF units"] || 0) + 1;
  return false;
});
checkFloors(rows, { etfs: 0, anchors: ANCHORS });

rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("russianstandard-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
