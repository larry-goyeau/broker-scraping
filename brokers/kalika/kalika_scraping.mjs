// What Kalika Securities (NEPSE broker no. 46, Kathmandu) sells in shares,
// with no login. Its site is a "Share Broker No. 46" with a TMS login for
// online clients, and its commission page prices "Equity Shares", bonds and
// debentures, and "Closed-end fund or mutual fund units", with "20% exchange
// commission (NEPSE)". It names no narrower set of shares, and every client
// orders through the exchange's TMS, where each member trades the whole
// board. So the book is every share NEPSE lets trade today, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there;
// bonds and mutual funds are left out there, like in the other Nepal
// catalogues). The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// The commission page is dated July 14, 2019 and still prints the old scale
// (0.4% or Rs 10 up to Rs 50,000, down to 0.27%).
//
//   https://kalikasecurities.com/
//   https://kalikasecurities.com/commission-and-fee/   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/kalika/kalika_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://kalikasecurities.com";

await writeNepseBook({
  broker: "Kalika Securities",
  out: new URL("kalika-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /Share Broker No\. 46 Follow us TMS login/i },
    { url: `${SITE}/commission-and-fee/`, pattern: /For Equity Shares S\.no\. Transaction Amount Commission\* 1 Rs\. 50,000 or less 0\.4%/i },
    { url: `${SITE}/commission-and-fee/`, pattern: /exchange commission \(NEPSE\)/i },
  ],
});
