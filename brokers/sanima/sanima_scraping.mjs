// What Sanima Securities (NEPSE broker no. 83, a subsidiary of Sanima Bank,
// Kathmandu) sells in shares, with no login. Its about page says it is
// "licensed Broker No. 83 from Securities Exchange Board of Nepal and Nepal
// Stock Exchange Limited", and its services page says "Online Clients can
// place buy/sell orders through TMS electronically." It names no narrower
// set, and every client orders through the exchange's TMS, where each member
// trades the whole board. So the book is every share NEPSE lets trade today,
// read from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees.
//
//   https://www.sanimasecurities.com.np/about-us
//   https://www.sanimasecurities.com.np/our-services   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/sanima/sanima_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.sanimasecurities.com.np";

await writeNepseBook({
  broker: "Sanima Securities",
  out: new URL("sanima-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/about-us`, pattern: /licensed Broker No\. 83 from Securities Exchange Board of Nepal and Nepal Stock Exchange/i },
    { url: `${SITE}/our-services`, pattern: /place buy\/sell orders through TMS/i },
    { url: `${SITE}/our-services`, pattern: /Rs 50,000 or Less 0\.36%/i },
  ],
});
