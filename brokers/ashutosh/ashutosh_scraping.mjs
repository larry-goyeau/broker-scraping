// What Ashutosh Brokerage & Securities (NEPSE broker no. 8, Kathmandu)
// sells in shares, with no login. The firm now trades as Brilliant
// Securities ("NEPSE Broker No. 8", tms08.nepsetms.com.np); the old domain
// ashutoshsecurities.com redirects to brilliantsecurities.com.np. Its
// services page offers "Equity Broking (NEPSE)": "Buy and sell NEPSE-listed
// securities through a regulated, compliance-first platform." It names no
// narrower set, and clients order through the exchange's TMS, where every
// member trades the whole board. So the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the pricing page prints the SEBON schedule: "Up to Rs. 50,000
// 0.36% or Rs. 10 minimum" down to "Above Rs. 1,00,00,000 0.24%".
//
//   https://www.brilliantsecurities.com.np/            (broker no. 8)
//   https://www.brilliantsecurities.com.np/services    (statement)
//   https://www.brilliantsecurities.com.np/pricing     (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/ashutosh/ashutosh_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.brilliantsecurities.com.np";

await writeNepseBook({
  broker: "Ashutosh Brokerage & Securities (Brilliant Securities)",
  out: new URL("ashutosh-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /NEPSE Broker No\. 8\b/ },
    { url: `${SITE}/services`, pattern: /Buy and sell NEPSE-listed securities/i },
    { url: `${SITE}/pricing`, pattern: /Up to Rs\. 50,000 0\.36% or Rs\. 10 minimum/i },
  ],
});
