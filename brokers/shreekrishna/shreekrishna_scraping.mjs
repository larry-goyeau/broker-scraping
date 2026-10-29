// What Shree Krishna Securities (SKSL, NEPSE broker no. 28, Kathmandu and
// Biratnagar) sells in shares, with no login. Its services page lists
// "EQUITY TRADING", "MUTUAL FUND TRADING" and "NON CONVERTIBLE BOND
// TRADING" with their commissions, and the home page offers "Apply For
// Online Trading" on the exchange's TMS (tms28.nepsetms.com.np). It names
// no narrower set of shares, and on TMS every member trades the whole
// board. So the book is every share NEPSE lets trade today, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees.
//
// Fees: the services page prints the equity commission: "0.40% or minimum
// Rs. 10 For below Rs. 50,000", then 0.37%, 0.34%, 0.30% and 0.27%, plus
// "Sebon Commission 0.015%" and Rs 25 DP. That is the SEBON schedule in
// force before 2024, above today's 0.36% top rate.
//
//   https://www.sksl.com.np/service   (statement, equity tariff)
//   https://www.sksl.com.np/          (online trading)
//   https://nepalstock.com.np/company
//
//   node brokers/shreekrishna/shreekrishna_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.sksl.com.np";

await writeNepseBook({
  broker: "Shree Krishna Securities",
  out: new URL("shreekrishna-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /Apply For Online Trading/i },
    { url: `${SITE}/service`, pattern: /EQUITY TRADING Stock Broker Commission for Per Transaction 0\.40% or minimum Rs\. 10 For below Rs\. 50,000/i },
  ],
});
