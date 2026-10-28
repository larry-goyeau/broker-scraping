// What Kohinoor Investment and Securities (NEPSE broker no. 35, Kathmandu)
// sells in shares, with no login. Its services page says: "We buy and sell
// stocks listed in NEPSE for both retail and institutional clients". It
// names no narrower set, and clients order through the exchange's TMS, so
// the book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there: debentures and closed-end
// mutual funds are left out, as in the other Nepal catalogues). The broker
// publishes no security list of its own. broker-list.json gives one place,
// Nepal Stock Exchange, with no restriction. Everything trades in rupees.
// The tariff is on the same page ("Upto Rs.50000 0.40" down to 0.27); it is
// the older SEBON schedule, not the 0.36% one in force since May 2024.
// The bare domain answers with a bot check, so the www host is read; if the
// check comes back there, the evidence fails and the run stops.
//
//   https://www.kohinoorinvestment.com/services/   (statement and tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/kohinoor/kohinoor_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const PAGE = "https://www.kohinoorinvestment.com/services/";

await writeNepseBook({
  broker: "Kohinoor Investment and Securities",
  out: new URL("kohinoor-parsed.json", import.meta.url),
  evidence: [
    { url: PAGE, pattern: /We buy and sell stocks listed in NEPSE for both retail and institutional clients/i },
    { url: PAGE, pattern: /Upto Rs\. ?50000 0\.40/i },
  ],
});
