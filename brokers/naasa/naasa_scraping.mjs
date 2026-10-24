// What Naasa Securities (NEPSE broker no. 58, Kathmandu) sells in shares,
// with no login. Its services page says: "Currently, stock trading is
// allowed only on the stocks listed on Nepal Stock Exchange Ltd." That
// sets the tradable universe to the NEPSE list and names no narrower set,
// and clients order through the exchange's TMS, where every member trades
// the whole board. So the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own; its Naasa X market
// view needs a login. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees.
//
//   https://naasasecurities.com.np/services   (statement)
//   https://naasasecurities.com.np/pricing/1   (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/naasa/naasa_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://naasasecurities.com.np";

await writeNepseBook({
  broker: "Naasa Securities",
  out: new URL("naasa-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services`, pattern: /stock trading is allowed only on the stocks listed on Nepal Stock Exchange/i },
    { url: `${SITE}/pricing/1`, pattern: /Rs\. 2,501 to Rs\. 50,000 0\.36 Percent/i },
  ],
});
