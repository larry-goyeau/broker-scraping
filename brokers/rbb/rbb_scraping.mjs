// What R.B.B Securities (NEPSE broker owned by the state Rastriya Banijya
// Bank) sells in shares, with no login. Its services page says it
// "provides seamless Online Trading services through the Trade Management
// System (TMS)", where every member trades the whole board, and prices
// "Brokerage Commission For Equity and Preference Shares of Listed
// Entities". It names no narrower set, so the book is every share NEPSE
// lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there: bonds, debentures and closed-end mutual funds
// are out, as in the other Nepal scrapers). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange. Everything trades in rupees.
//
//   https://www.rbbsecurities.com.np/services.html   (services and tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/rbb/rbb_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.rbbsecurities.com.np";

await writeNepseBook({
  broker: "RBB Securities",
  out: new URL("rbb-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services.html`, pattern: /Online Trading services through the Trade Management System \(TMS\)/i },
    { url: `${SITE}/services.html`, pattern: /Equity and Preference Shares of Listed Entities.{0,200}0\.36 percent/i },
  ],
});
