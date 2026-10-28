// PSB Investments (PJSC Bank PSB, Russia) is a broker on the Moscow
// Exchange: the stock market, the currency market and FORTS. It publishes
// no list of the shares and funds its app offers, so the catalogue is the
// Moscow Exchange equity listing (../sber/moexBook.mjs): every admitted
// share, depositary receipt and exchange fund (BPIF). Unit funds that are
// not ETFs (OPIF, IPIF, ZPIF) stay out.
//
//   "Вам будут доступны: Фондовый (основной) рынок Московской биржи, для
//    торговли российскими акциями и облигациями Валютный рынок Московской
//    биржи, для торговли валютными парами"
//   https://www.psbank.ru/personal/wealth/markets/faq
//
// Fees: "«Инвестор» Комиссия за заключение сделки — 0,25%" on the stock
// and currency markets, exchange fee included; "«Профессионал»" 0,3 % down
// to 0,045 % on the stock market, "«Трейдер»" 0,3 % down to 0,035 %.
//   https://www.psbank.ru/personal/wealth/rates
//   https://www.psbank.ru/qpstorage/psb/images/tarif_investor.pdf
//
// Exchange funds are sold: the "Инвестор" tariff buys PSB's own BPIF
// ("Покупка БПИФ «ПСБ – Денежный рынок»") without commission.
//
// Currency: a brokerage account can be opened in yuan ("Перечень
// иностранных валют, в которых может быть открыт Брокерский счет ... CNY
// (156) — Китайский юань"), so the yuan books of the funds quoted in CNY
// are kept next to their rouble books.
//
// Foreign issuers: "С 12 апреля 2018 года Банк приостанавливает прием и
// исполнение поручений на совершение сделок покупки иностранных ценных
// бумаг (евробонды, акции, депозитарные расписки, ETF и т.д.)". Since
// 1 September 2023 it takes orders again only for the foreign shares and
// receipts whose issuer chose Russia as its main place of business, and
// "Со списком иностранных долевых ценных бумаг можете ознакомиться по
// ссылке" (https://www.psbank.ru/qpstorage/psb/images/spisok_cen_b.pdf,
// "Список иностранных долевых ценных бумаг на 19.09.2023 г.", 15 lines,
// an image PDF, copied below). A foreign-issuer line of the Moscow
// Exchange that is not on that list is left out (today VEON-RX); OKEY is
// on it and stays, flagged in raw.
//
// Restriction in broker-list.json: "Foreign (non-EAEU) securities for
// qualified investors only". The FAQ answers "Нужно ли получать статус
// квалифицированного инвестора для совершения сделок с ИЦБ? Нет", and the
// remaining foreign lines are flagged in raw anyway. Civil servants and
// the military may buy only RU/SU ISINs ("Госслужащим можно выбирать
// только те активы, у которых ISIN начинается с RU или SU"): that depends
// on the client, so it is a remark, not a removal.
//   https://www.psbank.ru/personal/wealth/investor_school/module-8-4
//
//   node brokers/psb/psb_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, foreignIssuer, moexCatalogue } from "../sber/moexBook.mjs";

// spisok_cen_b.pdf, "Список иностранных долевых ценных бумаг на 19.09.2023 г."
const FOREIGN_LIST = new Set([
  "US7496552057", // AGRO
  "US83418T1088", // CIAN
  "US29760G1031", // ETLN
  "US98387E2054", // FIVE
  "US33835G2057", // FIXP
  "US91085A2033", // GEMC
  "US37949E2046", // GLTR
  "US42207L1061", // HHRU
  "US55279C2008", // MDMG
  "US6708662019", // OKEY
  "JE00B6TSS470", // POLY
  "US69269L1044", // OZON
  "US74735M1080", // QIWI
  "US87238U2033", // TCSG
  "NL0009805522", // YNDX
]);

await checkPages([
  {
    url: "https://www.psbank.ru/personal/wealth/markets/faq",
    lenient: true,
    phrases: [
      "Фондовый (основной) рынок Московской биржи, для торговли российскими акциями и облигациями",
      "Банк приостанавливает прием и исполнение поручений на совершение сделок покупки иностранных ценных бумаг",
      "Со списком иностранных долевых ценных бумаг можете ознакомиться по ссылке",
      "CNY (156)",
    ],
  },
  { url: "https://www.psbank.ru/personal/wealth/rates", lenient: true, phrases: ["Комиссия за заключение сделки — 0,25%"] },
  { url: "https://www.psbank.ru/qpstorage/psb/images/tarif_investor.pdf", pdf: true, lenient: true },
  { url: "https://www.psbank.ru/qpstorage/psb/images/spisok_cen_b.pdf", pdf: true, lenient: true },
]);

const { rows: book, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
const rows = book.filter((row) => {
  if (!foreignIssuer(row.isin) || FOREIGN_LIST.has(row.isin)) return true;
  left["foreign issuer not on PSB's list of foreign shares"] = (left["foreign issuer not on PSB's list of foreign shares"] || 0) + 1;
  return false;
});
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("psb-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
