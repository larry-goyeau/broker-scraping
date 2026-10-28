// What Capital Hub (NEPSE broker no. 85, Kathmandu) sells in shares, with
// no login. Its services page says: "We trade marketable securities like
// debentures, bonds, mutual funds, etc. through online TMS and offline",
// and lists "Ordinary share transaction" and "Promoter/auction share
// transaction". It names no narrower set of shares, and every client
// orders through the exchange's TMS (tms85.nepsetms.com.np), where each
// member trades the whole board. So the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there; bonds and mutual funds are left out there,
// like in the other Nepal catalogues). The broker publishes no security
// list of its own. broker-list.json gives one place, Nepal Stock Exchange,
// with no restriction. Everything trades in rupees.
//
//   https://capitalhub.com.np/services/   (statement and tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/capitalhub/capitalhub_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const PAGE = "https://capitalhub.com.np/services/";

await writeNepseBook({
  broker: "Capital Hub",
  out: new URL("capitalhub-parsed.json", import.meta.url),
  evidence: [
    { url: PAGE, pattern: /We trade marketable securities like debentures, bonds, mutual funds, etc\. through online TMS and offline/i },
    { url: PAGE, pattern: /Ordinary share transaction Promoter\/auction share transaction/i },
    { url: PAGE, pattern: /Rs 50,000 or Less Flat Rs 10 or 0\.40%/i },
  ],
});
