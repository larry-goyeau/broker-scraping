// What Linch Stock Market (NEPSE broker no. 41, Kathmandu and Butwal) sells
// in shares, with no login. Its trading page says: "We handle client orders
// for trading on equity shares, close-end schemes (mutual funds), preferred
// stocks, government and corporate bonds and corporate debentures." It
// names no narrower set, and clients order through the exchange's TMS
// (tms41), so the book is every share NEPSE lets trade today, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there:
// debentures and closed-end mutual funds are left out, as in the other
// Nepal catalogues). The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees. Margin trading is offered too,
// on NEPSE's approved list only; that is a feature, not a limit on what a
// cash client buys.
//
//   https://linch.com.np/service-detail/trading
//   https://linch.com.np/commission-and-fees/trading-and-commission-fees   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/linchmarket/linchmarket_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://linch.com.np";

await writeNepseBook({
  broker: "Linch Stock Market",
  out: new URL("linchmarket-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/service-detail/trading`, pattern: /client orders for trading on equity shares, close-end schemes \(mutual funds\), preferred stocks/i },
    { url: `${SITE}/commission-and-fees/trading-and-commission-fees`, pattern: /Rs\. 50,000 or less 0\.36% or Rs\. 10 whichever is higher/i },
  ],
});
