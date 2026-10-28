// What Vision Securities (NEPSE broker no. 34, Kathmandu) sells in shares,
// with no login. Its home page says it is "a member of the Nepal Stock
// Exchange Ltd. (NEPSE Broker No. 34), we provide full-service share
// trading", and its company profile adds "All the listed Mutual Funds are
// associated with us." It names no narrower set of shares, and every client
// orders through the exchange's TMS, where each member trades the whole
// board. So the book is every share NEPSE lets trade today, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there;
// mutual funds are left out there, like in the other Nepal catalogues).
// Its margin lending covers only the shares NEPSE lists as eligible, which
// is a financing remark, not a limit on what can be bought. The broker
// publishes no security list of its own. broker-list.json gives one place,
// Nepal Stock Exchange, with no restriction. Everything trades in rupees.
//
//   https://www.visionsecurities.com.np/
//   https://www.visionsecurities.com.np/company-profile   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/vision/vision_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.visionsecurities.com.np";

await writeNepseBook({
  broker: "Vision Securities",
  out: new URL("vision-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /member of the Nepal Stock Exchange Ltd\. \(NEPSE Broker No\. 34\), we provide full-service share trading/i },
    { url: `${SITE}/company-profile`, pattern: /Upto Rs\.50000 0\.36/i },
  ],
});
