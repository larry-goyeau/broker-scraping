// Bank Saint Petersburg (ПАО «Банк «Санкт-Петербург», BSPB) is a broker on
// the Moscow Exchange stock market; orders are given at its St Petersburg
// office or by telephone. It publishes no instrument list. Its key
// information document names the market and the instruments:
//
//   "Через Вашего Брокера Вы сможете совершать сделки со следующими
//    финансовыми инструментами: - с ценными бумагами, зарегистрированными
//    и допущенными к обращению на территории РФ ... - с иностранными
//    финансовыми инструментами, квалифицированными в качестве ценных
//    бумаг ... в Торговой системе ... ПАО «Московская биржа» (Фондовый
//    рынок) и/или на Внебиржевой рынок."
//   https://s3.ru-msk.k2.cloud/bucket-cms-prod/Klyuchevaya_informacziya_o_dogovore_brokerskogo_obsluzhivaniya_277cc6660d.pdf
//   "Банк регистрирует Клиента и принимает Поручения на сделки с ценными
//    бумагами, доступными на торгах в Секции фондовый рынок Московской
//    биржи" (Условия брокерского обслуживания, 16.A.1)
//   https://s3.ru-msk.k2.cloud/bucket-cms-prod/Usloviya_brokerskogo_obsluzhivaniya_v_PAO_Bank_Sankt_Peterburg_data_publikaczii_22_10_2025_f27df01a1a.pdf
//
// The information documents on the brokerage page include "Акция (пай)
// ETF" and the exchange unit fund, so the funds are sold.
//   https://www.bspb.ru/disclosure/traders/broker
//
// Fees: "Тарифы по брокерскому обслуживанию" (in force since 24.06.2021,
// no end date on the page), "Комиссия по биржевым сделкам купли-продажи
// ценных бумаг, номинированных рублях 1,5% от суммарного объема сделок за
// день, но не менее 5000 рублей"; Private Banking 0,5% down to 0,2%.
//   https://s3.ru-msk.k2.cloud/bucket-cms-prod/BSPB_broker_tariff_2021_06_24_5a7c1a96b1.pdf
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. The Условия let the
// bank limit trading modes "на свое усмотрение" but name none, so nothing
// else is removed.
//
// Yuan: the brokerage account is kept "в валюте Российской Федерации или
// иностранной валюте" (Условия, section 2) and the tariff prices
// "биржевых операций купли-продажи ценных бумаг, номинированных в
// иностранной валюте", so the yuan books of the funds quoted in CNY are
// kept next to their rouble books.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test): that depends on the client, as
// does the bank's list of securities for qualified investors.
//
//   node brokers/saintpetersburg/saintpetersburg_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://www.bspb.ru/disclosure/traders/broker",
    lenient: true,
    phrases: ["Ключевая информация о договоре брокерского обслуживания"],
  },
  { url: "https://s3.ru-msk.k2.cloud/bucket-cms-prod/BSPB_broker_tariff_2021_06_24_5a7c1a96b1.pdf", pdf: true, lenient: true },
  { url: "https://s3.ru-msk.k2.cloud/bucket-cms-prod/Klyuchevaya_informacziya_o_dogovore_brokerskogo_obsluzhivaniya_277cc6660d.pdf", pdf: true, lenient: true },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("saintpetersburg-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
