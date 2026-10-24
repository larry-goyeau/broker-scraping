// BCS World of Investments (BCS Mir Investitsiy, Russia) sells the
// securities of the Moscow Exchange stock section. Its stocks page says the
// app offers "инструменты фондовой секции Московской биржи, иностранные
// акции на Санкт-Петербургской бирже", and publishes no list of its own:
// the public screener under it is "ознакомительным, информация по ним
// устарела". So the catalogue is the Moscow Exchange equity listing
// (../sber/moexBook.mjs): every admitted share, depositary receipt and
// exchange fund (BPIF). Unit funds that are not ETFs (OPIF, IPIF, ZPIF)
// stay out.
//
//   "В приложении доступны инструменты фондовой секции Московской биржи,
//    иностранные акции на Санкт-Петербургской бирже, валютные пары,
//    фьючерсы на срочном рынке Мосбиржи и готовые решения БКС"
//   "Компания БКС «Мир Инвестиций» не осуществляет продажу иностранных
//    бумаг."
//   https://bcs.ru/markets
//
// Fees, on https://bcs.ru/tariffs: two plans. "Инвестор": 0 % on a
// purchase, 0,3 % on a sale. "Трейдер": 0,04 % of turnover up to 2 m
// roubles of assets, falling to 0,008 % above 300 m, 299 roubles a month
// when the account trades. Same table for the Moscow Exchange and the SPB
// Exchange; OTC trades 0,5 %. Full terms:
//   https://shared.storage.bcs.ru/static/bcs/files/tariffs/tariff-investor.pdf
//   https://shared.storage.bcs.ru/static/bcs/files/tariffs/tariff-traider.pdf
//
// bcs.ru answers scripts with a bot check, so these pages were read in a
// browser on 2026-10-23 and only the tariff PDFs, served from a separate
// host, are checked at run time.
//
// The tariff page withdraws yuan ("китайский юань (в БКС Банк)"), so the
// yuan books of the funds quoted in CNY are kept next to their rouble
// books.
//
// SPB Exchange: the app offers its foreign shares and broker-list.json
// limits the Investor plan to SPB trades "с расчетами в иностранной
// валюте". BCS publishes no list of them, and the SPB foreign boards carry
// no traded line today, so SPB Exchange is left out.
//
// Restriction in broker-list.json on the Moscow Exchange: "Foreign
// (non-EAEU) securities for qualified investors only". It depends on the
// client, not the title, so foreign issuers are flagged in raw instead of
// dropped.
//
//   node brokers/bcs/bcs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  { url: "https://shared.storage.bcs.ru/static/bcs/files/tariffs/tariff-investor.pdf", pdf: true },
  { url: "https://shared.storage.bcs.ru/static/bcs/files/tariffs/tariff-traider.pdf", pdf: true },
]);

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("bcs-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
