// What Online Securities (NEPSE broker, Kathmandu) sells in shares, with
// no login. Its services pages say: "Our reliable trading services for
// stocks, bonds, mutual funds and debentures on the Nepal Stock Exchange",
// and its Online TMS page lets clients "Buy and sell shares" through the
// exchange's TMS, where every member trades the whole board. It names no
// narrower set, so the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there:
// bonds, debentures and closed-end mutual funds are out, as in the other
// Nepal scrapers). The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange. Everything trades
// in rupees.
//
//   https://onlinesecurities.com.np/services/OnlineTms
//   https://onlinesecurities.com.np/services/Brokerage   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/onlinesecurities/onlinesecurities_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://onlinesecurities.com.np";

await writeNepseBook({
  broker: "Online Securities",
  out: new URL("onlinesecurities-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services/OnlineTms`, pattern: /trading services for stocks, bonds, mutual funds and debentures on the Nepal Stock Exchange/i },
    { url: `${SITE}/services/Brokerage`, pattern: /Rs 50,000 or Less 0\.36%/i },
  ],
});
