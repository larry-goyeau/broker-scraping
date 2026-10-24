// VTB My Investments (VTB Bank, Russia) sells the securities of the Moscow
// Exchange stock section. VTB publishes no instrument list of its own: its
// FAQ names the markets, and its tariff sends the client to the Moscow
// Exchange's own page for the full list of exchange funds:
//
//   "Вы можете инвестировать в широкий набор активов: российские акции и
//    облигации, валютные облигации, фонды, валюта и драгоценные металлы"
//   "основной рынок (фондовая и валютная секции Московской биржи)"
//   "СПБ Биржа (доступ к ограниченному перечню активов)"
//   https://www.vtb.ru/personal/investicii/help/obschie-voprosy-o-torgovle-na-birzhe/
//
//   "Комиссия брокера за покупку и продажу Биржевых паевых инвестиционных
//    фондов (БПИФ)** Без комиссии" / "** Полный перечень БПИФ, которые
//    можно купить и продать без комиссии, Вы найдете на сайте Московской
//    биржи www.moex.com/msn/etf."
//   "занять китайские юани под залог ценных бумаг и рублей"
//   https://www.vtb.ru/media-files/vtb.ru/sitepages/personal/investicii/tarify/moy_online.pdf
//
// So the catalogue is the Moscow Exchange equity listing (moexBook.mjs):
// every admitted share, depositary receipt and exchange fund (BPIF). Unit
// funds that are not ETFs (OPIF, IPIF, ZPIF) stay out. The account holds
// yuan (currency section, yuan margin loans), so the yuan books of the
// funds quoted in CNY are kept next to their rouble books.
//
// SPB Exchange: VTB gives access to a "limited list of assets" there and
// publishes no such list, so SPB Exchange is left out. The OTC market is
// VTB's structured bonds only.
//
// Restriction in broker-list.json: none on the Moscow Exchange. Foreign
// issuers are flagged in raw (qualified investors, or the test).
//
//   node brokers/vtb/vtb_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://www.vtb.ru/personal/investicii/help/obschie-voprosy-o-torgovle-na-birzhe/",
    lenient: true,
    phrases: ["основной рынок (фондовая и валютная секции Московской биржи)", "СПБ Биржа (доступ к ограниченному перечню активов)"],
  },
  { url: "https://www.vtb.ru/media-files/vtb.ru/sitepages/personal/investicii/tarify/moy_online.pdf", pdf: true, lenient: true },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("vtb-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
