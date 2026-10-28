// Ivolga Capital (Moscow, Russia) is a broker on the Moscow Exchange,
// through QUIK. It publishes no instrument list. Its key-information
// document names the exchange and the markets it offers there:
//
//   "Брокер является участником торгов ПАО Московская Биржа. На ПАО
//    Московская Биржа Брокер предоставляет возможность совершать сделки,
//    операции на фондовом рынке, валютном рынке и рынке драгметаллов."
//   https://ivolgacap.ru/services/trading/documents/
//   (Ключевая информация о договоре брокерского обслуживания)
//
//   Tariff "Универсальный", "1. Фондовый рынок ПАО Московская биржа":
//   0.5% a year of the assets held in the stock section, nothing on days
//   the assets are 50 000 roubles or less, exchange fees on top. In force
//   from 30.11.2023.
//   https://ivolgacap.ru/services/tarify/documents/
//   (ТАРИФЫ НА БРОКЕРСКОЕ ОБСЛУЖИВАНИЕ, Tarify_izm-SR-Rayf_chistyy.pdf)
//
// Its regulations run the test for unqualified clients, ETF units
// included (18.7.1, items 11 and 12), and name no excluded board or
// segment. So the catalogue is the Moscow Exchange equity listing
// (moexBook.mjs): every admitted share, depositary receipt and exchange
// fund (BPIF). Unit funds that are not ETFs (OPIF, IPIF, ZPIF) stay out.
//
// Currency: the tariff counts "Денежные средства в иностранной валюте,
// учитываемые на Инвестиционном счете Клиента в составе портфеля фондовой
// секции", and the account reaches the currency market, so the yuan books
// of the funds quoted in CNY are kept next to their rouble books.
//
// SPB Exchange: the services page also names it, but the key-information
// document and the tariff give only the Moscow Exchange, as does
// broker-list.json, so it is left out.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test).
//
//   node brokers/ivolga/ivolga_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://ivolgacap.ru/services/tarify/documents/", lenient: true, phrases: ["ТАРИФЫ НА БРОКЕРСКОЕ ОБСЛУЖИВАНИЕ"] },
  { url: "https://ivolgacap.ru/upload/iblock/d27/9h0kt7jzagr45em5szay09yi1jzkkxbk/Tarify_izm-SR-Rayf_chistyy.pdf", pdf: true, lenient: true },
  { url: "https://ivolgacap.ru/services/", lenient: true, phrases: ["Совершайте сделки с валютой, акциями, облигациями"] },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("ivolga-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
