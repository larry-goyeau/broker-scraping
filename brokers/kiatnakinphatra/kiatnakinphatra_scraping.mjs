// Kiatnakin Phatra Securities (KKPS, Kiatnakin Phatra Financial Group)
// sells Thai shares online through its wealth portal (online and mobile
// trading, "Phatra Edge"). Its one place for shares is the Stock Exchange
// of Thailand: the products page gives "Full access to all listed
// securities in SET and MAI" (both boards, one XBKK order book), and
// prints no list and no exception, so the catalogue is the whole SET book.
// The offshore stocks and ETFs of its Global Investment service are not in
// its broker-list row and their pages give neither a platform nor a
// tariff: left out.
//
//   https://wealthmanagement.kkpfg.com/landingpage/WhyPhatraEdge/Investment
//   https://wealthmanagement.kkpfg.com/landingpage/WhyPhatraEdge/FAQ
//
// Left out (in ../kgithailand/setBook.mjs): warrants and derivative
// warrants, rights, foreign-board lines (.F, .Q), pre-IPO lines, and lines
// with no trade for more than 30 days (suspended, halted or delisting).
//
// Fees (FAQ, "What is the commission rate at Kiatnakin Phatra
// Securities?"): "Generally, the commission rate of Online Trading are
// 0.15% for Equity Account (Pre-Paid) or 0.20% for Equity Account
// (Post-Paid) if orders are executed from clients' own PC terminal", 0.25%
// through the Financial Solution Center.
//
//   node brokers/kiatnakinphatra/kiatnakinphatra_scraping.mjs

import { writeSetCatalogue } from "../kgithailand/setBook.mjs";
import { pageSays } from "../alphasec/pdfSays.mjs";

await pageSays("https://wealthmanagement.kkpfg.com/landingpage/WhyPhatraEdge/Investment", [
  /Full access to all listed securities in SET and MAI/,
]);
await pageSays("https://wealthmanagement.kkpfg.com/landingpage/WhyPhatraEdge/FAQ", [
  /commission rate of Online Trading are 0\.15% for Equity Account \(Pre-Paid\) or 0\.20% for Equity Account \(Post-Paid\)/,
]);

const rows = await writeSetCatalogue(import.meta.url, "kiatnakinphatra-parsed.json");
if (rows.length < 1500) throw new Error(`only ${rows.length} SET rows`);
