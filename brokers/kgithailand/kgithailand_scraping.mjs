// KGI Securities (Thailand) sells on one place, the Stock Exchange of
// Thailand, and prints no list of its own. Its equity page says it is a
// SET member ("บริษัทสมาชิก หมายเลข 13") that brokers securities for Thai and
// foreign investors, online through KGI POWER TRADE. Its "ETF, DR" product
// page sells the Thai ETFs ("ETF คือ กองทุนเปิดที่จดทะเบียนและซื้อขายใน
// ตลาดหลักทรัพย์") and the depositary receipts on foreign shares ("DR ...
// ซื้อขายโดยใช้สกุลเงินบาทไทย"). No page leaves out a board (SET or mai),
// NVDRs, DRs, REITs or property and infrastructure funds. So the catalogue
// is the whole SET book.
//
//   https://www.kgieworld.co.th/corporate/products/equity
//   https://www.kgieworld.co.th/corporate/products/etf
//
// Left out (in ../kgithailand/setBook.mjs): warrants and derivative
// warrants (KGI issues its own DWs, suffix 13: they are not shares),
// rights, foreign-board lines (.F, .Q), pre-IPO lines, and lines with no
// trade for more than 30 days (suspended, halted or delisting). Structured
// notes are not exchange-traded. The Credit Balance (margin) account takes
// only the names on KGI's marginable list: that depends on the account, so
// it is a remark, not a removal.
//
// Fees (no login), one tariff for every SET line, by daily traded value and
// account type, internet Cash Balance 0.150% + 0.007% exchange fees:
//   https://www.kgieworld.co.th/corporate/investment/feerate
//   https://www.kgieworld.co.th/corporate/media/pdf/feerate/eq-commission-th.pdf
//
//   node brokers/kgithailand/kgithailand_scraping.mjs

import { writeSetCatalogue } from "./setBook.mjs";

await writeSetCatalogue(import.meta.url, "kgithailand-parsed.json");
