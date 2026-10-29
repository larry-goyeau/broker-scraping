// What Nepal Investment & Securities Trading (NIST19, NEPSE broker no. 19,
// Kathmandu and Biratnagar) sells in shares, with no login. Its home page
// says it is "Licensed as the 19th member broker by the Nepal Stock
// Exchange (NEPSE)" and offers to "buy or sell stocks" for its clients,
// with online orders through the exchange's TMS (tms19.nepsetms.com.np).
// It names no narrower set, and on TMS every member trades the whole
// board. So the book is every share NEPSE lets trade today, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees.
//
// Fees: the FAQ page ("Broker fees") prints the equity table: "Rs 50,000
// or Less 0.36%" down to "Above Rs 1,00,00,000 0.24%", plus the 0.015%
// SEBON fee and Rs 25 DP charge.
//
//   https://nist19.com/              (statement)
//   https://nist19.com/pages/faq     (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/nist19/nist19_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://nist19.com";

await writeNepseBook({
  broker: "Nepal Investment & Securities Trading",
  out: new URL("nist19-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /Licensed as the 19th member broker by the Nepal Stock Exchange/i },
    { url: `${SITE}/pages/faq.php`, pattern: /Rs 50,000 or Less 0\.36%/i },
  ],
});
