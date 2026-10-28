// What UD Capital (AO "UD Capital", Almaty; app "UDC Invest") sells in
// shares and ETFs on the Kazakhstan Stock Exchange, with no login.
//
// Its brokerage page says it runs deals "на KASE и международных
// площадках" and offers "акций, облигаций казахстанских и иностранных
// эмитентов". Its tariff (approved 22.07.2024) prices, under "Сделки на
// локальном рынке", "Сделки с корпоративными ценными бумагами - 0,3% от
// суммы сделки, не менее 3 МРП на биржевом рынке" (0,5 %, min 6 MRP off the
// exchange), plus third-party fees; foreign markets are a separate line
// ("Сделки на международном рынке", 0,3 %, min 3 MRP). Neither the tariff,
// the brokerage page nor the brokerage regulation (106 pages) names a KASE
// board, segment, KASE Global, ETF or depositary-receipt exclusion, and
// broker-list.json names none. So the catalogue is the whole KASE book
// (owner rule for a single-place broker).
//
// The book is ./kaseBook.mjs: every KASE share (main and alternative
// boards, the unlisted sector), KASE Global share, depositary receipt and
// exchange-traded fund, each in its own trading currency (KZT or USD), on
// KASE (MIC XKAZ). Left out there, as in other scrapers: delisted lines,
// lines suspended with no resumption and no trade since, lines never
// traded, lines with no trade in two years, interval mutual fund units
// (not exchange-traded funds), bonds and derivatives. AIX (Astana) is a
// separate place and is not part of this catalogue.
//
//   https://udcapital.kz/brokerskie-uslugi/
//   https://udcapital.kz/downloads/files/brokerage-services/Tarify_na_BU_s_ND_21.08.2024.pdf   (fees)
//   https://udcapital.kz/downloads/files/brokerage-services/Reglament_po_osuschestvleniyu_brokerskoy_deyatelnosti.pdf
//   https://kase.kz/en/markets/shares-and-adr-gdr
//
//   node brokers/udcapitaludcinve/udcapitaludcinve_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { kaseBook } from "./kaseBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("udcapitaludcinve-parsed.json", import.meta.url);

const { rows, leftOut } = await kaseBook();

for (const ticker of ["KSPI", "HSBK", "KZAP", "AAPL_KZ", "SPY_KZ"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the KASE book`);
}
// 121 rows on 25 October 2026.
if (rows.length < 90) throw new Error(`the KASE book has only ${rows.length} rows`);

rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const counts = {};
for (const row of stamped) counts[`${row.type} ${row.currency}`] = (counts[`${row.type} ${row.currency}`] || 0) + 1;
const reasons = {};
for (const line of leftOut) {
  const idle = line.reason.match(/^no trade since (\d{4})/);
  (reasons[idle ? "no trade in two years" : line.reason] ||= []).push(idle ? `${line.ticker} (${idle[1]})` : line.ticker);
}
for (const [reason, list] of Object.entries(reasons)) console.error(`left out, ${reason} (${list.length}): ${list.join(" ")}`);
console.error(`dropped as bonds: ${rows.length - stamped.length}; no ISIN: ${stamped.filter((row) => !row.isin).length}`);
console.error(Object.entries(counts).map(([key, count]) => `${key}: ${count}`).join("; "));
console.error(`wrote ${OUTPUT.pathname} (${stamped.length} rows)`);
