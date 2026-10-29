// What Sri Hari Securities (NEPSE broker no. 56, Kamaladi, Kathmandu) sells
// in shares, with no login. Its services page says its trading service
// "allows all our clients to buy and sell stocks from their accounts.
// However, the clients can trade only the stocks listed by the Nepal Stock
// Exchange Ltd." That sets the universe to the NEPSE list and names no
// narrower set, and clients order through the exchange's TMS, where every
// member trades the whole board. So the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the pricing page ("Fees And Commission", equity) prints "0.36%
// minimum Rs. 10 for Up to Rs. 50,000" down to "0.24% for Above Rs.
// 10,000,001", plus the 0.015% SEBON fee and Rs 25 DP charge.
//
//   https://www.sriharisecurities.com.np/post/services   (statement)
//   https://www.sriharisecurities.com.np/post/pricing    (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/srihari/srihari_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.sriharisecurities.com.np";

await writeNepseBook({
  broker: "Sri Hari Securities",
  out: new URL("srihari-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/post/services`, pattern: /the clients can trade only the stocks listed by the Nepal Stock Exchange/i },
    { url: `${SITE}/post/pricing`, pattern: /0\.36% minimum Rs\. 10 for Up to Rs\. 50,000/i },
  ],
});
