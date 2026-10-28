// What Excel for Financial Investments (Bank of Jordan's brokerage, Amman)
// sells, with no login. It is a broker and dealer on the Amman Stock
// Exchange: it offers "securities' trading services for its customers, in
// accordance with their direct buy and sell orders", in its trading rooms
// and by internet trading. It names no market, board or company it does not
// trade, so the book is every listed ASE share (first and second market).
// Its bond tariff is for ASE bonds, which are left out as in other
// scrapers.
//
//   https://excelinvest.jo/en/why-boj
//   https://excelinvest.jo/en/internet-trading
//
// The shared ASE book reads the exchange's own list of listed shares,
// joins the ISIN from the Securities Depository Center, and drops the lines
// the ASE has suspended (by its "Public Companies" circulars, checked on
// each company's trading history). The ASE lists no ETF, fund or
// depository receipt ("No Investment Fund listed yet."), so every row is a
// share in dinars. The third market (unlisted securities, OTC) is not in
// the book: the broker's pages do not mention it. A line the ASE marks
// "Restricted Trading" stays, with the note in raw. Margin finance is
// offered "for VIP customers" only: a remark, not a removal.
//
// Fees (no login): stocks 0.003 to 0.004 JD per JD traded, plus 0.0022 of
// the trading volume for the capital market institutions, and trade tax.
//
//   https://excelinvest.jo/en/brokerage
//
//   node brokers/excelfor/excelfor_scraping.mjs

import { writeAmmanCatalogue } from "../unitedarabjordan/ammanBook.mjs";

await writeAmmanCatalogue(import.meta.url, "excelfor-parsed.json");
