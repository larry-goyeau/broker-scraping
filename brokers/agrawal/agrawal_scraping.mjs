// What Agrawal Securities (NEPSE broker no. 6, Kathmandu) sells in shares,
// with no login. Its trading services page says: "We provide trading
// platform for securities like equities (public and promoter),mutual fund
// units, government bonds and corporate debentures as authorized by
// Security Boards of Nepal (SEBON)", and clients "trade securities through
// TMS system". It names no narrower set of shares, and every client orders
// through the exchange's TMS, where each member trades the whole board. So
// the book is every share NEPSE lets trade today, public and promoter lines
// alike, read from the exchange's company list by ../thrive/nepseBook.mjs
// and ../kumari/nepseShares.mjs (what is kept and left out is written
// there). Bonds and debentures are out as in every catalogue; the mutual
// fund units it also trades are left out by the shared module, like in the
// other Nepal catalogues. The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
//   https://www.agrawalsecurities.com.np/trading-services/
//   https://www.agrawalsecurities.com.np/trading-fee-structure/   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/agrawal/agrawal_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.agrawalsecurities.com.np";

await writeNepseBook({
  broker: "Agrawal Securities",
  out: new URL("agrawal-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/trading-services/`, pattern: /trading platform for securities like equities \(public and promoter\)/i },
    { url: `${SITE}/trading-fee-structure/`, pattern: /EQUITY TRADING Stock Broker Commission for Per Transaction 0\.36%/i },
  ],
});
