// What Sweta Securities (NEPSE broker, Kathmandu) sells in shares, with no
// login. Its services page says: "Trade with us in equity, mutual fund,
// bond and debenture listed in Nepal Stock Exchange." and its home page
// that it facilitates "transactions for various types of securities listed
// with NEPSE". Neither says "all" word for word, but neither names a
// narrower set, and clients order through the exchange's TMS, where every
// member trades the whole board. So the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of its
// own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
//   https://swetasecurities.com/services   (statement and equity tariff)
//   https://swetasecurities.com/
//   https://nepalstock.com.np/company
//
//   node brokers/sweta/sweta_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://swetasecurities.com";

await writeNepseBook({
  broker: "Sweta Securities",
  out: new URL("sweta-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services`, pattern: /equity, mutual fund, bond and debenture listed in Nepal Stock Exchange/i },
    { url: `${SITE}/services`, pattern: /Rs 50,000 or Less 0\.36%/i },
  ],
});
