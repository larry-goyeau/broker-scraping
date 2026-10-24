// What Nabil Stock Dealer (NEPSE broker no. 77, a subsidiary of Nabil
// Bank) sells in shares, with no login. Its brokerage services page says
// it buys and sells "stocks on behalf of our clientele, specifically
// focusing on stocks listed on the NEPSE", and under "What You Can Trade"
// lists "Ordinary shares of NEPSE-listed companies" and "Mutual fund units
// listed on NEPSE". It names no narrower set, and clients order through
// the exchange's TMS (tms77.nepsetms.com.np), where every member trades
// the whole board. So the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees.
//
//   https://www.nabilstockdealer.com.np/services/brokerage-services/   (statement)
//   https://www.nabilstockdealer.com.np/commission-rate/   (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/nabilsd/nabilsd_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.nabilstockdealer.com.np";

await writeNepseBook({
  broker: "Nabil",
  out: new URL("nabilsd-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services/brokerage-services/`, pattern: /Ordinary shares of NEPSE-listed companies/i },
    { url: `${SITE}/commission-rate/`, pattern: /Rs\. 50,000 or less 0\.36%/i },
  ],
});
