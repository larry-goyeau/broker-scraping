// What Oxford Securities (NEPSE broker no. 51, Kalimati, Kathmandu) sells
// in shares, with no login. Its home page offers "Share Trading" (BO
// account opening, phone and e-mail trade) and links the exchange's TMS
// (tms51.nepsetms.com.np) for online orders; the company "is also the
// member of Nepal Stock Exchange Ltd. (NEPSE)". It names no narrower set,
// and on TMS every member trades the whole board. So the book is every
// share NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the brokerage page says "The Broker commission rate is fixed by
// the regulatory authorities" but its table is empty; the home page's
// "Brokerage Commission Details" (a March 2020 post) prints the schedule:
// "Up to Rs. 50,000 0.60%" down to "Above Rs. 1,00,00,000 0.40%", minimum
// Rs 25, DP Rs 25. That schedule was cut by SEBON in December 2020 and
// again since (today's top rate is 0.36%).
//
//   https://oxfordsecurities.com.np/oxford                               (statement, tariff)
//   https://oxfordsecurities.com.np/oxford/stock-brokerage-services.html
//   https://nepalstock.com.np/company
//
//   node brokers/oxford/oxford_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://oxfordsecurities.com.np/oxford";

await writeNepseBook({
  broker: "Oxford Securities",
  out: new URL("oxford-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/stock-brokerage-services.html`, pattern: /member of Nepal Stock Exchange Ltd\. \(NEPSE\)/i },
    { url: `${SITE}`, pattern: /tms51\.nepsetms\.com\.np/, text: getText },
    { url: `${SITE}`, pattern: /Up to Rs\. 50,000 0\.60%/i },
  ],
});
