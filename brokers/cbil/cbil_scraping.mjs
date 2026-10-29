// What CBIL Securities (Citizens Share Broker, NEPSE broker no. 91, a
// Citizens Bank International company) sells in shares, with no login.
// Its services page says: "We are the member of Nepal Stock Exchange
// (NEPSE)" and lists "Providing Stock Trading services"; the site links
// "TMS 91 Login" and TMS account registration. It names no narrower set,
// and on TMS every member trades the whole board. So the book is every
// share NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: "Fees and Commission", equity page: "Rs. 1 to Rs. 50,000 0.36%"
// down to "Above Rs. 1,00,00,000 0.24%".
//
//   https://citizensbroker.com/services   (statement)
//   https://citizensbroker.com/equity     (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/cbil/cbil_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://citizensbroker.com";

await writeNepseBook({
  broker: "CBIL Securities (Citizens Share Broker)",
  out: new URL("cbil-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services`, pattern: /We are the member of Nepal Stock Exchange \(NEPSE\)/i },
    { url: `${SITE}/services`, pattern: /Providing Stock Trading services/i },
    { url: `${SITE}/equity`, pattern: /Rs\. 1 to Rs\. 50,000 0\.36%/i },
  ],
});
