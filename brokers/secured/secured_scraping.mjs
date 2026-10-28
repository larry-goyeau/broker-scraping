// What Secured Securities (NEPSE broker no. 36, Kathmandu) sells in shares,
// with no login. Its trading page says: "We handle client orders for
// trading on equity shares, close-end schemes (mutual funds), preferred
// stocks, government and corporate bonds and corporate debentures", and its
// about page says it serves "investors trading in NEPSE". Clients order
// through the exchange's TMS, where every member trades the whole board,
// and the broker names no narrower set. So the book is every share NEPSE
// lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there: bonds, debentures and closed-end mutual funds
// are out, as in the other Nepal scrapers). Margin trading depends on the
// client and removes nothing. The broker publishes no security list of its
// own. broker-list.json gives one place, Nepal Stock Exchange. Everything
// trades in rupees.
//
//   https://ssl.com.np/service/trading
//   https://ssl.com.np/about-us
//   https://ssl.com.np/trading-commission-and-fees   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/secured/secured_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://ssl.com.np";

await writeNepseBook({
  broker: "Secured Securities",
  out: new URL("secured-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/service/trading`, pattern: /client orders for trading on equity shares, close-end schemes \(mutual funds\), preferred stocks/i },
    { url: `${SITE}/trading-commission-and-fees`, pattern: /Rs\. 2501 to Rs\. 50,000 0\.36%/i },
  ],
});
