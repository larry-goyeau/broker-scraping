// What Magnet Securities and Investment Company (NEPSE broker no. 95)
// sells in shares, with no login. Its services page says: "We provide best
// brokerage service for buying and selling of all kinds of securities
// listed with Nepal Stock Exchange Ltd. (NEPSE) such as shares, mutual
// fund debentures and bonds through Trade Management System (TMS)".
// Clients order through the exchange's TMS (tms95.nepsetms.com.np), so the
// book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees. The pricing
// page prints the SEBON brokerage bands in Nepali (Rs 50,000 or less
// ०.३६ %, then ०.३३, ०.३१, ०.२७ and ०.२४ %) and the DP charges.
//
//   https://magnetsecurities.com.np/services   (statement)
//   https://magnetsecurities.com.np/pricing   (tariff, in Nepali)
//   https://nepalstock.com.np/company
//
//   node brokers/magnet/magnet_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://magnetsecurities.com.np";

await writeNepseBook({
  broker: "Magnet",
  out: new URL("magnet-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services`, pattern: /all kinds of securities listed with Nepal Stock Exchange/i },
    // "रु. ५०,०००।– सम्म ०.३६ %": up to Rs 50,000, 0.36 percent.
    { url: `${SITE}/pricing`, pattern: /५०,०००.{0,4}सम्म ०\.३६ ?%/ },
  ],
});
