// What Himalayan Brokerage (NEPSE broker no. 63) sells in shares, with no
// login. Its brokerage service page says it provides "buying and selling
// of equity stocks, bonds, mutual funds, and debentures listed in Nepal
// Stock Exchange" through the TMS. It does not say "all" word for word,
// but names no narrower set, and clients order through the exchange's TMS
// (tms63.nepsetms.com.np), where every member trades the whole board. So
// the book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees.
//
//   https://himalayanbroker.com/services/brokerage-service   (statement and tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/himalayan/himalayan_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const PAGE = "https://himalayanbroker.com/services/brokerage-service";

await writeNepseBook({
  broker: "Himalayan",
  out: new URL("himalayan-parsed.json", import.meta.url),
  evidence: [
    { url: PAGE, pattern: /equity stocks, bonds, mutual funds, and debentures listed in Nepal Stock Exchange/i },
    { url: PAGE, pattern: /Rs\. 50,000 or less 0\.36 ?%/i },
  ],
});
