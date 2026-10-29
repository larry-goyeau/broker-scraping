// What Index Securities (NEPSE broker no. 69, Dillibazar, Kathmandu) sells
// in shares, with no login. Its services page says: "Our platform
// facilitates seamless buying and selling of equity stocks, mutual funds,
// debentures, and bonds listed on the Nepal Stock Exchange." It names no
// narrower set, and clients order through the exchange's TMS
// (tms69.nepsetms.com.np), where every member trades the whole board. So
// the book is every share NEPSE lets trade today, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees.
//
// Fees: the same page prints "Brokerage Charge": "Rs 50,000 or Less Flat
// Rs. 10 or 0.36% (whichever is higher)" down to 0.24%.
//
//   https://www.indexsecuritiesnepal.com/services.php   (statement, equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/indexsec/indexsec_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.indexsecuritiesnepal.com";

await writeNepseBook({
  broker: "Index Securities",
  out: new URL("indexsec-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services.php`, pattern: /buying and selling of equity stocks, mutual funds, debentures, and bonds listed on the Nepal Stock Exchange/i },
    { url: `${SITE}/services.php`, pattern: /Rs 50,000 or Less Flat Rs\. 10 or 0\.36%/i },
  ],
});
