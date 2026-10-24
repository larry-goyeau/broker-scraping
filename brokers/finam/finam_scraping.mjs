// Finam (AO FINAM, Russia) sells the securities of the Moscow Exchange
// and the SPB Exchange to every client, and NYSE, NASDAQ and HKEX shares
// to qualified investors. It publishes no list of what its terminals
// offer, so the catalogue is the Moscow Exchange equity listing
// (../sber/moexBook.mjs): every admitted share, depositary receipt and
// exchange fund (BPIF). Unit funds that are not ETFs (OPIF, IPIF, ZPIF)
// stay out.
//
//   "Покупайте акции, облигации и фонды на Московской и
//    Санкт-Петербургской биржах без брокерской комиссии"
//   https://broker.finam.ru/landing/tariffs/
//
// Fees, on the same page and the plan pages under it. "Долгосрочный
// портфель": 0 % on Russian securities, 0,1 % on NASDAQ, HKEX and NYSE.
// "Инвестор": 0,035 % up to 1 m roubles a day, 0,030 % to 5 m, 0,025 %
// above, plus a settlement fee of 0,03 % on the Moscow Exchange and
// 0,01 % on the SPB Exchange, 200 roubles a month. "Стратег": 0,05 %.
// "Единый дневной": up to 0,0354 %, 177 roubles a month.
//   https://broker.finam.ru/landing/tariffs-n3-investor/
//
// finam.ru, broker.finam.ru and zaoik.finam.ru answer scripts with a bot
// check, so these pages were read in a browser on 2026-10-23 and nothing
// is checked at run time.
//
// The plans keep foreign currency ("Хранение иностранной валюты"), so the
// yuan books of the funds quoted in CNY are kept next to their rouble
// books.
//
// Foreign markets: the tariff says "Материал и сделки с упомянутыми
// инструментами – только для квалифицированных инвесторов" and "Доступность
// бирж, операций и инструментов может измениться. Пожалуйста, уточняйте
// доступность бирж у менеджера". No list of the NYSE, NASDAQ or HKEX lines
// is published, so those places are left out, and so are Xetra, Tokyo,
// Shanghai and Shenzhen, which broker-list.json names with the same
// restriction. The SPB Exchange foreign boards carry no traded line today
// and Finam lists none, so SPB is left out too.
//
// Restriction in broker-list.json on the Moscow Exchange: "Foreign
// (non-EAEU) securities for qualified investors only". It depends on the
// client, not the title, so foreign issuers are flagged in raw instead of
// dropped.
//
//   node brokers/finam/finam_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, countRows, moexCatalogue } from "../sber/moexBook.mjs";

const { rows, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("finam-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
