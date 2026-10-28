// What Opal Securities Investment (NEPSE broker no. 4, Lazimpat, Kathmandu)
// sells in shares, with no login. Its brokerage service page says: "We as a
// broker facilitate our clients to conduct buy and sell transactions of
// equity shares, preference shares, convertible and non-convertible
// debentures, bonds and other securities", and its about page says it
// operates "as Broker No. 4 under the Nepal Stock Exchange (NEPSE)". It
// names no narrower set, and clients order through the exchange's TMS
// (tms04.nepsetms.com.np), so the book is every share NEPSE lets trade
// today, read from the exchange's company list by ../thrive/nepseBook.mjs
// and ../kumari/nepseShares.mjs (what is kept and left out is written
// there: debentures and closed-end mutual funds are left out, as in the
// other Nepal catalogues, though Opal prints a tariff for both). The broker
// publishes no security list of its own. broker-list.json gives one place,
// Nepal Stock Exchange, with no restriction. Everything trades in rupees.
// The tariff ("For Equity Shares and Preference Shares", 0.40% up to
// Rs. 50,000 down to 0.27%) is on the online trading service page.
//
//   https://opalsecurities.com.np/service/1/details   (brokerage service)
//   https://opalsecurities.com.np/who-we-are
//   https://opalsecurities.com.np/service/2/details   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/opal/opal_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://opalsecurities.com.np";

await writeNepseBook({
  broker: "Opal Securities Investment",
  out: new URL("opal-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/service/1/details`, pattern: /buy and sell transactions of equity shares, preference shares/i },
    { url: `${SITE}/who-we-are`, pattern: /Broker No\. 4 under the Nepal Stock Exchange/i },
    { url: `${SITE}/service/2/details`, pattern: /For Equity Shares and Preference Shares From To Commission Rates 1 50,000 0\.40%/i },
  ],
});
