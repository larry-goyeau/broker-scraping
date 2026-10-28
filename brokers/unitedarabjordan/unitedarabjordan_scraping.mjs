// What the United Arab Jordan Company for Investment and Financial
// Brokerage (AJIB's brokerage arm, Amman) sells, with no login. It trades
// one place, the Amman Stock Exchange: it facilitates "the purchase and
// sale of local stocks within Amman Stock Exchange", by phone, in its
// trading room or in the AJIB Brokerage app. It names no market, board or
// company it does not trade, so the book is every listed ASE share (first
// and second market).
//
//   https://www.uajib.com/en/who-we-are
//   https://www.uajib.com/en/service/financial-liaison
//   https://www.uajib.com/en/service/trading-via-the-ajib-brokerage-application
//
// The shared ASE book reads the exchange's own list of listed shares,
// joins the ISIN from the Securities Depository Center, and drops the lines
// the ASE has suspended (by its "Public Companies" circulars, checked on
// each company's trading history). The ASE lists no ETF, fund or
// depository receipt ("No Investment Fund listed yet."), so every row is a
// share in dinars. The third market (unlisted securities, OTC) is not in
// the book: the broker's pages do not mention it. A line the ASE marks
// "Restricted Trading" stays, with the note in raw.
//
// Fees (no login): the FAQ gives the commission "per invoice", from JOD
// 0.0052 to 0.0062 through brokers and from JOD 0.0042 to 0.0082 in the
// app, including the capital market institutions' share and tax.
//
//   https://www.uajib.com/en/faq
//
//   node brokers/unitedarabjordan/unitedarabjordan_scraping.mjs

import { writeAmmanCatalogue } from "./ammanBook.mjs";

await writeAmmanCatalogue(import.meta.url, "unitedarabjordan-parsed.json");
