// Russ-Invest (PAO "IK RUSS-INVEST", Moscow) is a broker on the Moscow
// Exchange: stock, currency and derivatives markets, through QUIK. It
// publishes no instrument list, so the catalogue is the Moscow Exchange
// equity listing (../sber/moexBook.mjs): every admitted share, depositary
// receipt and exchange fund (BPIF), minus foreign issuers. Unit funds
// that are not ETFs (OPIF, IPIF, ZPIF) stay out.
//
//   "Торгуйте на Российском рынке ценных бумаг"
//   "Услуги, которые мы предоставляем Торговля акциями/облигациями/паями
//    российских эмитентов"
//   https://www.russ-invest.com/itrade/brokerskoe-obsluzhivanie/
//
// The service is shares, bonds and units "российских эмитентов", so the
// two foreign-issuer lines of the book (OKEY, Luxembourg GDR; VEON-RX,
// Bermuda) are left out.
//
// Fees: individuals, "Тарифный план «Устойчивый»" 0,1 % of turnover on
// the securities market, "«Голосовой»" (orders by phone) 0,2 %.
//   https://www.russ-invest.com/investment/documents/tarifs/
//
// Currency: the tariff charges for holding "доллары США, Евро, китайский
// юань" on the client account and the broker sells currency on the
// Moscow Exchange ("Валютный рынок Осуществление операций по покупке или
// продаже иностранной валюты"), so the yuan books of the funds quoted in
// CNY are kept next to their rouble books.
//
// Restriction in broker-list.json: none.
//
//   node brokers/russ/russ_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { ANCHORS, ETF_ANCHORS, checkFloors, checkPages, countRows, moexCatalogue } from "../sber/moexBook.mjs";

await checkPages([
  {
    url: "https://www.russ-invest.com/itrade/brokerskoe-obsluzhivanie/",
    lenient: true,
    phrases: [
      "Торговля акциями/облигациями/паями российских эмитентов",
      "Осуществление операций по покупке или продаже иностранной валюты",
      "«Устойчивый» «Голосовой»",
    ],
  },
  { url: "https://www.russ-invest.com/investment/documents/tarifs/", pdf: true, lenient: true },
]);

const { rows: book, left } = await moexCatalogue({ currencies: ["RUB", "CNY"] });
const rows = book.filter((row) => {
  if (row.isin.startsWith("RU")) return true;
  left["not a Russian issuer"] = (left["not a Russian issuer"] || 0) + 1;
  return false;
});
checkFloors(rows, { anchors: [...ANCHORS, ...ETF_ANCHORS] });

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("russ-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows`, countRows(written));
console.error("left out:", left);
