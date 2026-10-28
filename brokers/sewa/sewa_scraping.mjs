// What Sewa Securities (NEPSE broker no. 54, Kathmandu and Hetauda) sells
// in shares, with no login. Its about page says it is "a member of Nepal
// Stock Exchange Ltd. (NEPSE)" providing "securities trading", and its FAQ
// says the TMS account is "a platform to buy and sell securities from
// secondary market". It names no narrower set, and clients order through
// the exchange's TMS (tms54), so the book is every share NEPSE lets trade
// today, read from the exchange's company list by ../thrive/nepseBook.mjs
// and ../kumari/nepseShares.mjs (what is kept and left out is written
// there: debentures and closed-end mutual funds are left out, as in the
// other Nepal catalogues). The broker publishes no security list of its
// own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees. The tariff is on the home page
// ("Fees & Commision", ordinary share: "Upto NRs. 50,000 0.36%").
//
//   https://sewasecurities.com.np/about/
//   https://sewasecurities.com.np/faq/   (often answers 503, so the run
//     checks only the about and home pages)
//   https://sewasecurities.com.np/   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/sewa/sewa_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://sewasecurities.com.np";

await writeNepseBook({
  broker: "Sewa Securities",
  out: new URL("sewa-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/about/`, pattern: /a member of Nepal Stock Exchange Ltd\. \(NEPSE\)/i },
    { url: `${SITE}/`, pattern: /Upto NRs\. 50,000 0\.36%/i },
  ],
});
