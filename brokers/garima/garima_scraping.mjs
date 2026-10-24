// What Garima Securities (NEPSE broker, Kathmandu) sells in shares, with
// no login. Its stock brokerage page says: "Our clients can trade the
// stocks that are listed on Nepal Stock Exchange Ltd by using their
// computers, smartphones, tablets etc." It names no narrower set, and
// clients order through the exchange's TMS, where every member trades the
// whole board. So the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees.
//
//   https://garimasecurities.com.np/post-stock-brokerage
//   https://garimasecurities.com.np/post/pricing   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/garima/garima_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://garimasecurities.com.np";

await writeNepseBook({
  broker: "Garima Securities",
  out: new URL("garima-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/post-stock-brokerage`, pattern: /trade the stocks that are listed on Nepal Stock Exchange/i },
    { url: `${SITE}/post/pricing`, pattern: /Rs\. 50,000 0\.36 Percent/i },
  ],
});
