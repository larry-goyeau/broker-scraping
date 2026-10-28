// What Investment Management Nepal (NEPSE broker, Kathmandu) sells in
// shares, with no login. Its home page says: "We offer full-fledged stock
// brokerage services for buying and selling securities listed on the Nepal
// Stock Exchange Ltd. (NEPSE)", with "Real-time trade execution through
// NEPSE Online Trading System (NOTS)", where every member trades the whole
// board. It names no narrower set, so the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there: debentures and mutual funds are out, as in the
// other Nepal scrapers). The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange. Everything trades
// in rupees. The tariff (ordinary share, debenture, mutual fund) sits on the
// same home page.
//
//   https://imnpltd.com.np/   (services and tariff)
//   https://imnpltd.com.np/wp-content/uploads/2024/07/Online-Trading-Manual.pdf
//   https://nepalstock.com.np/company
//
//   node brokers/imnepal/imnepal_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://imnpltd.com.np";

await writeNepseBook({
  broker: "Investment Management Nepal",
  out: new URL("imnepal-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /buying and selling securities listed on the Nepal Stock Exchange/i },
    { url: `${SITE}/`, pattern: /Up to Rs\. 50,000 0\.360%/i },
  ],
});
