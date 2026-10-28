// What Imperial Securities (NEPSE broker no. 45, Kathmandu) sells in
// shares, with no login. Its site is a Nuxt app that reads its words from
// the broker's own API. The "Stock Brokerage Service" entry says it is "the
// member of NEPSE (Nepal Stock Exchange limited)" and "We work with clients
// to place orders to buy or sell stocks". It names no narrower set, and
// clients order through the exchange's TMS (tms45), so the book is every
// share NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there: debentures and closed-end mutual funds are
// left out, as in the other Nepal catalogues). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees. Margin
// lending covers only "Scripts listed under the approved companies for
// margin trading by NEPSE"; that limits the loan, not what a cash client
// buys. The tariff (equity "0.36% or Rs. 10 whichever is higher" up to
// Rs. 50,000) is on the fees page, from the same API.
//
//   https://imperialsecurities.com.np/quick-links/fees-and-commission   (tariff)
//   https://admin-dashboard.imperialsecurities.com.np/api/v1/home
//   https://admin-dashboard.imperialsecurities.com.np/api/v1/fees-and-commissions
//   https://nepalstock.com.np/company
//
//   node brokers/imperial/imperial_scraping.mjs

import { writeNepseBook, getText, pageWords } from "../thrive/nepseBook.mjs";

const API = "https://admin-dashboard.imperialsecurities.com.np/api/v1";

// The API answers JSON with HTML inside; read it back as plain words.
const apiWords = async (url) => pageWords(JSON.stringify(JSON.parse(await getText(url))));

await writeNepseBook({
  broker: "Imperial Securities",
  out: new URL("imperial-parsed.json", import.meta.url),
  evidence: [
    { url: `${API}/home`, pattern: /member of NEPSE \(Nepal Stock Exchange limited\).{0,80}We work with clients to place orders to buy or sell stocks/i, text: apiWords },
    { url: `${API}/fees-and-commissions`, pattern: /"0\.36% or Rs\. 10 whichever is higher","transaction_amount":"Rs\. 50,000 or less"/, text: apiWords },
  ],
});
