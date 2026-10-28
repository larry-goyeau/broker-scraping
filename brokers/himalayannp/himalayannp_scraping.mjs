// What Himalayan Securities (NEPSE broker no. 96, Kathmandu, a subsidiary
// of Himalayan Bank) sells in shares, with no login. Its company profile
// says it is "a member (No. 96) of the Nepal Stock Exchange (NEPSE)", and
// its services page says it "provides Online and Offline Trading service"
// where "Online Clients can place buy/sell orders through TMS". It names
// no narrower set (no board, segment or type left out; the FAQ has none
// either), and every client orders through the exchange's TMS
// (tms96.nepsetms.com.np), where each member trades the whole board. So
// the book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees.
//
// Folder himalayannp, not himalayan: brokers/himalayan/ is Himalayan
// Brokerage (broker no. 63), another firm.
//
//   https://himalayansecurities.com/about-us
//   https://himalayansecurities.com/our-services   (tariff)
//   https://himalayansecurities.com/faqu
//   https://nepalstock.com.np/company
//
//   node brokers/himalayannp/himalayannp_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://himalayansecurities.com";

await writeNepseBook({
  broker: "Himalayan Securities",
  out: new URL("himalayannp-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/about-us`, pattern: /member \(No\. 96\) of the Nepal Stock Exchange \(NEPSE\)/i },
    { url: `${SITE}/our-services`, pattern: /Online Clients can place buy\/sell orders through TMS/i },
    { url: `${SITE}/our-services`, pattern: /Rs 50,000 or Less 0\.36%/i },
  ],
});
