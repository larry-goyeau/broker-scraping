// What Nagarik Stock Dealer (NEPSE broker no. 60, New Baneshwor, Kathmandu,
// a Citizen Investment Trust company) sells in shares, with no login. Its
// pages fill themselves from a JSON call (/Client/GetServices), which is
// read here. The "Brokerage Service" entry says the company "is the member
// of Nepal Stock Exchange limited (NEPSE)", that "We assist clients in
// placing orders to buy or sell securities" and "provide online trading
// platform"; the site links its TMS login (nsd.nepsetms.com.np). It names
// no narrower set, and on TMS every member trades the whole board. So the
// book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees.
//
// Fees: the same entry prints "As per rules of Securities Board of Nepal
// the stock brokerage charges per transaction": 1 to 50,000 0.36% down to
// 0.24%; the home page calculator (Scripts/shared/commission-rates.js)
// applies the same rates since 2020-12-26 with a Rs 10 minimum, the 0.015%
// SEBON fee and Rs 25 DP charge.
//
//   https://nagariksd.com.np/Services
//   https://nagariksd.com.np/Client/GetServices?isActive=1&pageNo=1&itemsPerPage=50   (statement, tariff)
//   https://nagariksd.com.np/Scripts/shared/commission-rates.js
//   https://nepalstock.com.np/company
//
//   node brokers/nagarik/nagarik_scraping.mjs

import { writeNepseBook, getText, pageWords } from "../thrive/nepseBook.mjs";

const SITE = "https://nagariksd.com.np";

// The services list, as the page gets it; its HTML is entity-escaped.
async function serviceWords(url) {
  const { data } = JSON.parse(await getText(url));
  const html = data.map((service) => service.description).join(" ");
  return pageWords(html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
}

const SERVICES = `${SITE}/Client/GetServices?name=&isActive=1&pageNo=1&itemsPerPage=50&pagePerDisplay=10`;

await writeNepseBook({
  broker: "Nagarik Stock Dealer",
  out: new URL("nagarik-parsed.json", import.meta.url),
  evidence: [
    { url: SERVICES, pattern: /member of Nepal Stock Exchange limited \(NEPSE\)/i, text: serviceWords },
    { url: SERVICES, pattern: /placing orders to buy or sell securities/i, text: serviceWords },
    { url: SERVICES, pattern: /stock brokerage charges per transaction[\s\S]{0,200}\b1 1 50,000 0\.36%/i, text: serviceWords },
  ],
});
