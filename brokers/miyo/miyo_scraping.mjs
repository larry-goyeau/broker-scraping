// What Miyo Securities (NEPSE broker no. 66, Hattisar, Kathmandu) sells in
// shares, with no login. Its services page describes brokerage as acting
// "as intermediary between investor and NEPSE giving retail and
// institutional investors opportunity to buy and sell equities via stock
// exchange", and its brokerage page offers "Equity Trading": "Dive into
// the world of stocks with TMS platform." It names no narrower set, and on
// TMS every member trades the whole board. So the book is every share
// NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the "Fees, Commission and CGT" page prints the equity table:
// "0.36% minimum Rs. 10 for Up to Rs. 50,000" down to "0.24% for Above Rs.
// 10,000,001", plus the 0.015% SEBON fee and Rs 25 DP charge.
//
//   https://miyo66.com/our-services/             (statement)
//   https://miyo66.com/brokerage/                (TMS)
//   https://miyo66.com/fees-commission-and-cgt/  (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/miyo/miyo_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://miyo66.com";

await writeNepseBook({
  broker: "Miyo Securities",
  out: new URL("miyo-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/our-services/`, pattern: /intermediary between investor and NEPSE giving retail and institutional investors opportunity to buy and sell equities/i },
    { url: `${SITE}/brokerage/`, pattern: /Dive into the world of stocks with TMS platform/i },
    { url: `${SITE}/fees-commission-and-cgt/`, pattern: /0\.36% minimum Rs\. 10 for Up to Rs\. 50,000/i },
  ],
});
