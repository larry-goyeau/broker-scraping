// What Dakshinkali Investment & Securities (NEPSE broker no. 33) sells in
// shares, with no login. Its about page says it "has been actively
// performing the trading of securities of all the listed companies in
// Nepal Stock Exchange Ltd". Clients order through the exchange's TMS
// (tms33.nepsetms.com.np), so the book is every share NEPSE lets trade
// today, read from the exchange's company list by ../thrive/nepseBook.mjs
// and ../kumari/nepseShares.mjs (what is kept and left out is written
// there). The broker publishes no security list of its own; its "Live
// Market" link goes to nepalstock.com. broker-list.json gives one place,
// Nepal Stock Exchange, with no restriction. Everything trades in rupees.
//
//   https://displtd33.com/about-us/   (statement)
//   https://displtd33.com/broker-services/   (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/dakshinkali/dakshinkali_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://displtd33.com";

await writeNepseBook({
  broker: "Dakshinkali",
  out: new URL("dakshinkali-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/about-us/`, pattern: /trading of securities of all the listed companies in Nepal Stock Exchange/i },
    { url: `${SITE}/broker-services/`, pattern: /Rs 50,000 or Less 0\.36/i },
  ],
});
