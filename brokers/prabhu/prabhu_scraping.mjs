// What Prabhu Stock Market (NEPSE broker no. 99, Kathmandu, a Prabhu Bank
// company) sells in shares, with no login. Its brokerage page says: "We
// offer stock brokerage services that help clients buy and sell shares
// listed on the Nepal Stock Exchange (NEPSE)." It names no narrower set,
// and clients order online through the exchange's TMS (the site links
// "Open a TMS Account" and "TMS Login"), where every member trades the
// whole board. So the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json
// gives one place, Nepal Stock Exchange, with no restriction. Everything
// trades in rupees.
//
// Fees: the "Fee and Commission" page prints the equity table ("Rs. 50,000
// or less 0.36%" down to "Above Rs. 10,000,000 0.24%", plus the 0.015%
// SEBON fee and Rs 25 DP charge).
//
//   https://www.prabhustock.com/services/brokerage-services   (statement)
//   https://www.prabhustock.com/resource/fee-and-commission   (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/prabhu/prabhu_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.prabhustock.com";

await writeNepseBook({
  broker: "Prabhu Stock Market",
  out: new URL("prabhu-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services/brokerage-services`, pattern: /buy and sell shares listed on the Nepal Stock Exchange \(NEPSE\)/i },
    { url: `${SITE}/resource/fee-and-commission`, pattern: /Rs\. 50,000 or less 0\.36%/i },
  ],
});
