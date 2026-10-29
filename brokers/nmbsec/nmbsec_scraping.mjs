// What N.M.B. Securities (NEPSE broker no. 82, an NMB Bank company) sells in
// shares, with no login. Its services page says: "We offer stock
// brokerage solutions that encompass the purchase and sale of stocks on
// behalf of our clientele, specifically focusing on stocks listed on the
// NEPSE", with "a dedicated stock trading platform" (the exchange's TMS,
// tms82.nepsetms.com.np). It names no narrower set, and on TMS every member
// trades the whole board. So the book is every share NEPSE lets trade
// today, read from the exchange's company list by ../thrive/nepseBook.mjs
// and ../kumari/nepseShares.mjs (what is kept and left out is written
// there). The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the same page ("Pricing in Securities Trading") prints the
// commission table: "Upto Rs. 50,000 0.36%" down to 0.24%, "charged as per
// the Securities Businessperson (stock broker and stock dealer) Regulation
// 2064".
//
//   https://www.nmbsl.com.np/our-services   (statement, equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/nmbsec/nmbsec_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://www.nmbsl.com.np";

await writeNepseBook({
  broker: "N.M.B. Securities",
  out: new URL("nmbsec-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/our-services`, pattern: /specifically focusing on stocks listed on the NEPSE/i },
    { url: `${SITE}/our-services`, pattern: /Upto Rs\. 50,000 0\.36%/i },
  ],
});
