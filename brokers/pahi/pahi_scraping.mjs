// What Pahi Investment (NEPSE broker no. 79, Putalisadak, Kathmandu) sells
// in shares, with no login. Its services page says it will "Execute
// buy/sell order on behalf of customers" and "offers Online Trading through
// Trade Management System (TMS)". It names no narrower set of shares, and
// every client orders through the exchange's TMS, where each member trades
// the whole board. So the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there;
// bonds and mutual funds are left out there, like in the other Nepal
// catalogues). The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
//   https://pahiinvestment.com/services/
//   https://pahiinvestment.com/fees-commissions/   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/pahi/pahi_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://pahiinvestment.com";

await writeNepseBook({
  broker: "Pahi Investment",
  out: new URL("pahi-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services/`, pattern: /Execute buy\/sell order on behalf of customers/i },
    { url: `${SITE}/services/`, pattern: /offers Online Trading through Trade Management System \(TMS\)/i },
    { url: `${SITE}/fees-commissions/`, pattern: /Up to Rs\. 50000 0\.36%/i },
  ],
});
