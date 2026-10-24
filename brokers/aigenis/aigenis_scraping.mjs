// What AIGENIS (ZAO "Aigenis", Minsk) sells in shares online, with no
// login. Its app, AIGENIS invest, trades on two exchanges: the Belarusian
// Currency and Stock Exchange (BCSE) on a brokerage account, and the Moscow
// Exchange (MOEX) through trust management "by order" with its Russian
// subsidiary IK Aigenis.
//
// BCSE. The tariff prices "Заключение сделок в торговой системе ОАО
// «Белорусская валютно-фондовая биржа» с акциями через программный комплекс
// AIGENIS invest": 0,3% от суммы сделки, но не менее 2,00 бел.руб. (deals in
// shares in the BCSE trading system through AIGENIS invest: 0.3%, at least
// BYN 2). The Belarus market page repeats it ("Комиссия за сделки с
// акциями составляет 0,3% от суммы сделки, но не менее 2 бел.руб.") and
// says "Инвестируйте в акции ведущих белорусских компаний и банков". The
// tariff covers shares in the exchange's trading system with no list of
// its own, so the book is every share BCSE admits to trading, read from
// the exchange's securities directory by ./bcseShares.mjs (off-list
// shares included). BCSE lists no ETF; its investment fund units are not
// admitted. Prices in BYN.
//
// MOEX. Sold online too, with published fees (management 1% a year, 0.035%
// a trade, MOEX fees), but AIGENIS prints no list. Its MOEX page says the
// shares flagged by the exchange as of "повышенный уровень сложности"
// cannot be bought ("инструменты с повышенным уровнем сложности в
// приложении недоступны для покупки"), that "Можно ли сформировать
// постоянный список недоступных бумаг? К сожалению, на текущий момент нет
// такой возможности", and that exchange funds (БПИФ) are only planned
// ("Добавление БПИФ ... находится в планах"). The page says the flag is
// set by the exchange and is the one that makes an unqualified investor in
// Russia pass a test ("Для покупки таких инструментов неквалифицированным
// инвесторам в РФ требуется пройти специальное тестирование"). Under the
// Bank of Russia rule that test covers shares outside the quotation lists
// (listing level 3) and shares of foreign issuers, so the MOEX book is
// every admitted share of a Russian issuer on listing level 1 or 2, in
// roubles ("Торги на Московской бирже ведутся в российских рублях"), read
// by ../sber/moexBook.mjs. No exchange fund (BPIF). This is the owner's
// choice (2026-10-24); the run fails if those answers leave the page.
// No other foreign market is sold online: the Belarus page sends clients
// asking for US or other foreign shares to the Russian office for advice.
//
// Restrictions: broker-list.json names none.
//
//   https://aigenis.by/tarify/
//   https://aigenis.by/fondovyj-rynok-belarusi/
//   https://aigenis.by/rossijskij-fondovyj-rynok/
//   https://bcse.by/for_investors/securities_directory
//   https://iss.moex.com/iss/engines/stock/markets/shares/securities.json
//
//   node brokers/aigenis/aigenis_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { moexBook, moexRow } from "../sber/moexBook.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bcseShares, getText, words } from "./bcseShares.mjs";
import fs from "node:fs";

const OUTPUT = new URL("aigenis-parsed.json", import.meta.url);

const EVIDENCE = [
  { url: "https://aigenis.by/tarify/", pattern: /с акциями через программный комплекс AIGENIS invest \d? ?0,3% от суммы сделки, но не менее 2,00 бел\.руб/ },
  { url: "https://aigenis.by/fondovyj-rynok-belarusi/", pattern: /Комиссия за сделки с акциями составляет 0,3% от суммы сделки, но не менее 2 бел\.руб/ },
  { url: "https://aigenis.by/rossijskij-fondovyj-rynok/", pattern: /постоянный список недоступных бумаг\? К сожалению, на текущий момент нет такой возможности/ },
  { url: "https://aigenis.by/rossijskij-fondovyj-rynok/", pattern: /Признак повышенной сложности присваивает биржа/ },
  { url: "https://aigenis.by/rossijskij-fondovyj-rynok/", pattern: /неквалифицированным инвесторам в РФ требуется пройти специальное тестирование/ },
  { url: "https://aigenis.by/rossijskij-fondovyj-rynok/", pattern: /Торги на Московской бирже ведутся в российских рублях/ },
];

for (const { url, pattern } of EVIDENCE) {
  if (!pattern.test(words(await getText(url)))) throw new Error(`${url} no longer says ${pattern}`);
}

const { rows, counts } = await bcseShares();
for (const ticker of ["T0146-S0012", "SberB-S0009", "T0925-S0001"]) {
  if (!rows.some((row) => row.ticker === ticker && /^BY/.test(row.isin))) throw new Error(`${ticker} is missing from the BCSE book`);
}

const moexLeft = {};
for (const line of await moexBook()) {
  const reason =
    line.kind !== "STOCK" ? `MOEX ${line.kind}` :
    line.currency !== "RUB" ? `MOEX share in ${line.currency}` :
    line.foreign ? "MOEX foreign issuer (test)" :
    !(line.listLevel <= 2) ? "MOEX listing level 3 (test)" : "";
  if (reason) { moexLeft[reason] = (moexLeft[reason] || 0) + 1; continue; }
  rows.push(moexRow(line));
}
const moexCount = rows.filter((row) => row.exchange === "Moscow Exchange").length;
if (moexCount < 80) throw new Error(`only ${moexCount} MOEX shares on listing levels 1-2`);
for (const isin of ["RU0009029540", "RU0009024277"]) {
  if (!rows.some((row) => row.isin === isin && row.exchange === "Moscow Exchange")) throw new Error(`${isin} is missing from the MOEX book`);
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const stamped = stampRows(withoutObligations(rows));
if (stamped.length !== rows.length) throw new Error(`${rows.length - stamped.length} shares were taken for bonds`);
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));
const levels = Object.entries(counts.levels).map(([level, count]) => `${count} ${level}`).join(", ");
console.error(`MOEX: ${moexCount} shares; left out ${JSON.stringify(moexLeft)}`);
console.error(`BCSE: ${stamped.length - moexCount} shares (${levels}); ${counts.noIsin} without ISIN, ${counts.notToday} not trading today, ${counts.noTradeYear} with no trade in a year`);
console.error(`wrote ${OUTPUT.pathname}`);
