// What SharePro Securities (NEPSE broker, Dhalko, Kathmandu) sells in
// shares, with no login. Its brokerage page says: "Currently, stock trading
// is allowed only on the stocks listed on Nepal Stock Exchange Ltd." That
// sets the tradable universe to the NEPSE list and names no narrower set,
// and clients order through the exchange's TMS, where every member trades
// the whole board. So the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees.
//
//   https://shareprosecurities.com/services/brokerage-services   (statement and tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/sharepro/sharepro_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const PAGE = "https://shareprosecurities.com/services/brokerage-services";

await writeNepseBook({
  broker: "SharePro Securities",
  out: new URL("sharepro-parsed.json", import.meta.url),
  evidence: [
    { url: PAGE, pattern: /stock trading is allowed only on the stocks listed on Nepal Stock Exchange/i },
    { url: PAGE, pattern: /Rs\. 50,000 0\.36 Percent/i },
  ],
});
