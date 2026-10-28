// What Sajilo Broker (NEPSE broker no. 90, Babarmahal, Kathmandu) sells in
// shares, with no login. Its brokerage page says it acts as an intermediary
// "that connects buyers and sellers to facilitate Equity, Debenture and
// Bond transaction", lists "Ordinary share transaction" and
// "Promoter/auction share transaction", and prices equity, mutual fund,
// government bond and corporate bond trades. It names no narrower set of
// shares, and every client orders through the exchange's TMS, where each
// member trades the whole board. So the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there; bonds and mutual funds are left out there,
// like in the other Nepal catalogues). The broker publishes no security
// list of its own. broker-list.json gives one place, Nepal Stock Exchange,
// with no restriction. Everything trades in rupees.
//
//   https://sajilobroker.com.np/brokerage-services/   (statement and tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/sajilo/sajilo_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const PAGE = "https://sajilobroker.com.np/brokerage-services/";

await writeNepseBook({
  broker: "Sajilo Broker",
  out: new URL("sajilo-parsed.json", import.meta.url),
  evidence: [
    { url: PAGE, pattern: /facilitate Equity, Debenture and Bond transaction/i },
    { url: PAGE, pattern: /Ordinary share transaction Promoter\/auction share transaction/i },
    { url: PAGE, pattern: /Equity Trading Transaction Amount Commission\(In %\) Up to Rs\. 50,000 or Less 0\.40%/i },
  ],
});
