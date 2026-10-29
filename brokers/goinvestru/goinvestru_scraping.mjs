// Go Invest (ООО «Го Инвест», Moscow) is a broker on the Moscow Exchange and
// for shares listed in Hong Kong, through its app and web terminal
// (https://trade.goinvest.ru/). It publishes no instrument list. Its
// tariffs (Тарифные планы, Приложение №1.1 к Регламенту, from 31.07.2026):
//
//   "1.1. Тарифный план «Investor» ... 0,3% от суммы сделки" (exchange
//    deals; the plan sheet: "Сделки покупки-продажи ценных бумаг на
//    биржевых рынках ... 0,3")
//   "6. Исполнение поручений на сделки с ценными бумагами эмитентов с
//    листингом на Hong Kong Stock Exchange (Гонконгская фондовая биржа)
//    6.1. Тарифные планы «Trader», «Private Professional», «Optimal» 0,12%
//    от суммы сделки"
//   "При торговле гонконгскими акциями взимается гербовый сбор в размере
//    0,13% от суммы каждой сделки"
//   https://cdncl.goinvest.ru/files/docs/346-tarify-ooo-goinvest-31072026.pdf
//   https://cdncl.goinvest.ru/files/docs/04-investor.pdf
//   https://goinvest.ru/tariffs/
// The same tariff refers to "Срочном рынке ПАО Московская Биржа" and the
// "Единый рынок" account mode of the Moscow Exchange.
//
// So the catalogue is, with no list, each place's whole listing:
//   - Moscow Exchange: every admitted share, depositary receipt and
//     exchange fund (BPIF) in roubles (../sber/moexBook.mjs). Unit funds
//     that are not ETFs stay out; no yuan settlement of securities is
//     named, so the yuan books stay out;
//   - Hong Kong: every share, REIT and ETF trading on HKEX today
//     (../primehk/hkexBook.mjs: suspended and never-traded lines, debt,
//     warrants and CBBCs out), one row per trading counter (HKD, and the
//     RMB and USD counters HKEX lists separately). The tariff prices HKEX
//     trades only for the self-directed «Trader» plan and the adviser plans
//     (not «Investor»); Go Invest does not say how the orders reach HKEX,
//     and no page restricts which Hong Kong titles can be bought.
//
// Folder: goinvestru, because "goinvest" is the Uzbek GOINVEST in
// broker-list.json (front.mjs needs FOLDER_LIST goinvestru: "Go Invest").
//
// Restriction in broker-list.json: none.
//
// Run-time checks: the tariffs page must still show the Investor rate, and
// the full tariff PDF must still be served.
//
//   node brokers/goinvestru/goinvestru_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";

await checkPages([
  { url: "https://goinvest.ru/tariffs/", lenient: true, phrases: ["Стартовый тариф Investor", "Комиссия за сделку 0,3%"] },
  { url: "https://cdncl.goinvest.ru/files/docs/346-tarify-ooo-goinvest-31072026.pdf", pdf: true, lenient: true },
]);

const moex = await moexCatalogue({ currencies: ["RUB"] });
const hk = await hkexBook();
const hkRows = hk.rows.map((row) => ({ ...row, raw: `${row.raw} | Go Invest: HKEX orders on the Trader and adviser plans` }));
if (hkRows.length < 2000) throw new Error(`only ${hkRows.length} HKEX rows`);
for (const code of ["00700", "00005", "02800"]) {
  if (!hkRows.some((row) => row.ticker === code || row.ticker === String(Number(code)))) throw new Error(`HKEX ${code} is missing`);
}

const rows = [...moex.rows, ...hkRows];
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("goinvestru-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", { moex: moex.left, hkex: hk.dropped?.length ?? hk.dropped, listDate: hk.listDate, quoteDate: hk.quoteDate });
