// What Sunrise Securities (NEPSE broker no. 100) sells in shares, with no
// login. Its services page says it enables "clients to trade equity
// stocks, mutual funds, bonds, and debentures listed on the Nepal Stock
// Exchange". It does not say "all" word for word, but names no narrower
// set, and clients order through the exchange's TMS
// (tms100.nepsetms.com.np), where every member trades the whole board. So
// the book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees. The equity
// tariff is on the same services page.
//
//   https://www.sunrisesecurities.com.np/services/   (statement and equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/sunrisesec/sunrisesec_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const PAGE = "https://www.sunrisesecurities.com.np/services/";

await writeNepseBook({
  broker: "Sunrise Securities",
  out: new URL("sunrisesec-parsed.json", import.meta.url),
  evidence: [
    { url: PAGE, pattern: /equity stocks, mutual funds, bonds, and debentures listed on the Nepal Stock Exchange/i },
    { url: PAGE, pattern: /Flat Rs\. ?10 0\.36 ?% 0\.33 ?% 0\.31 ?% 0\.27 ?% 0\.24 ?%/i },
  ],
});
