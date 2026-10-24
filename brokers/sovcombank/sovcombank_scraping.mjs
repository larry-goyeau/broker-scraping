// Sovcombank Investments (Sovcombank, Russia) sells the securities of the
// Moscow Exchange. Its instrument catalogue lives inside the client app
// (/lk/catalog, fed by a websocket) and is not readable without a
// session, and Sovcombank publishes no other list, so the catalogue is
// the Moscow Exchange equity listing (moexBook.mjs): every admitted
// share, depositary receipt and exchange fund (BPIF). Unit funds that are
// not ETFs (OPIF, IPIF, ZPIF) stay out.
//
//   "Торгуйте акциями, облигациями, фондами, валютой и переводите ценные
//    бумаги от других брокеров"
//   "0,09% комиссия за сделки с другими инструментами: акциями,
//    облигациями, фондами и валютой."
//   https://invest.sovcombank.ru/investor/broker
//
//   "Система позволяет розничным клиентам торговать ценными бумагами и
//    другими инструментами на Московской бирже"
//   https://invest.sovcombank.ru/i/programmnoe_obespechenie
//
// The account buys currency ("валютой"), so the yuan books of the funds
// quoted in CNY are kept next to their rouble books.
//
// SPB Exchange: broker-list.json lists it, but the only Sovcombank page
// naming it is a promotion that waives the commission "за сделки на
// фондовом рынке ПАО Московская Биржа и ПАО СПБ Биржа"
// (https://invest.sovcombank.ru/smartlab26). No page says which SPB
// titles the app offers and there is no list, so SPB Exchange is left out.
//
// Restriction in broker-list.json: none. Foreign issuers are flagged in
// raw (qualified investors, or the test).
//
//   node brokers/sovcombank/sovcombank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://invest.sovcombank.ru/investor/broker",
    lenient: true,
    phrases: ["Торгуйте акциями, облигациями, фондами, валютой", "0,09% комиссия за сделки с другими инструментами: акциями, облигациями, фондами и валютой."],
  },
  {
    url: "https://invest.sovcombank.ru/i/programmnoe_obespechenie",
    lenient: true,
    phrases: ["торговать ценными бумагами и другими инструментами на Московской бирже"],
  },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("sovcombank-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
