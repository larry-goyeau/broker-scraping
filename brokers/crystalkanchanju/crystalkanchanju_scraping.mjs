// What Crystal Kanchanjungha Securities (NEPSE broker no. 50, Kathmandu)
// sells in shares, with no login. Its services page says, in Nepali, that
// its clients can place buy and sell orders for securities listed on NEPSE
// through their TMS account ("TMS खातामार्फत NEPSE मा सूचीकृत धितोपत्रहरूको
// खरिद तथा बिक्री आदेश पेश गर्न सक्नुहुन्छ"). It names no narrower set, so
// the book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there: debentures and closed-end
// mutual funds are left out, as in the other Nepal catalogues). The broker
// publishes no security list of its own. broker-list.json gives one place,
// Nepal Stock Exchange, with no restriction. Everything trades in rupees.
//
//   https://crystalsecurities.com/services/
//   https://crystalsecurities.com/trading-commission-and-fees/   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/crystalkanchanju/crystalkanchanju_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://crystalsecurities.com";

await writeNepseBook({
  broker: "Crystal Kanchanjungha Securities",
  out: new URL("crystalkanchanju-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services/`, pattern: /TMS खातामार्फत NEPSE मा सूचीकृत धितोपत्रहरूको खरिद तथा बिक्री/ },
    { url: `${SITE}/trading-commission-and-fees/`, pattern: /Rs\. 2501 to 50,000 0\.36%/i },
  ],
});
