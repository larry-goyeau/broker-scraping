// I V Global Securities (Thailand) sells on one place, the Stock Exchange
// of Thailand, and prints no list of its own. Its securities-trading page
// says clients "conduct transactions independently through our company
// using SETTRADE-Streaming, SETTRADE IPhone, IVG Gold and phone-in
// services", and its tariff is one sliding scale for every SET trade. No
// page leaves out a board (SET or mai), NVDRs, DRs, REITs or ETFs. So the
// catalogue is the whole SET book.
//
//   https://www.ivglobal.co.th/content/articles/securities-trading.html
//   https://www.ivglobal.co.th/content/articles/internet-trading.html
//
// Left out (in ../kgithailand/setBook.mjs): warrants and derivative
// warrants, rights, foreign-board lines (.F, .Q), pre-IPO lines, and lines
// with no trade for more than 30 days (suspended, halted or delisting).
// Mutual funds sold as selling agent are not exchange-traded.
//
// Fees (no login): daily-value scale, internet Cash Balance 0.15% down to
// 0.10% + VAT, plus 0.007% exchange fees, minimum 50 baht a day:
//   https://www.ivglobal.co.th/content/articles/brokerages-fees.html
//
//   node brokers/ivglobal/ivglobal_scraping.mjs

import { writeSetCatalogue } from "../kgithailand/setBook.mjs";

await writeSetCatalogue(import.meta.url, "ivglobal-parsed.json");
