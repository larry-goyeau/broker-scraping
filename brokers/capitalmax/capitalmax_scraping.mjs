// What Capital Max Securities (NEPSE broker no. 62, Kamalpokhari,
// Kathmandu) sells in shares, with no login. Its home page says it offers
// "stock trading services wherein we facilitate buy and sell of equity
// stocks, mutual funds, and debentures and bonds listed on the Nepal Stock
// Exchange", and its "Stock Brokerage Service" offers "Online Trading
// through Trade Management System (TMS)". It names no narrower set, and on
// TMS every member trades the whole board. So the book is every share
// NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the services page fills itself from a JSON call
// (GetPublishedServices, a POST read here); the brokerage entry prints "Rs
// 50,000 or Less: Flat Rs 10 or 0.36% (whichever is higher)" down to
// "Above 1,00,00,000: 0.24%", plus the 0.015% SEBON fee and Rs 25 DP.
//
//   https://www.capitalmax.com.np/            (statement)
//   https://www.capitalmax.com.np/Services
//   https://www.capitalmax.com.np/GetPublishedServices   (TMS, equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/capitalmax/capitalmax_scraping.mjs

import { writeNepseBook, pageWords } from "../thrive/nepseBook.mjs";

const SITE = "https://www.capitalmax.com.np";

// The services list, as the page asks for it.
async function serviceWords(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" },
    body: JSON.stringify({ pageNo: 1, itemsPerPage: 10, pagePerDisplay: 5, isHome: false }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const { result } = await response.json();
  return pageWords(result.data.map((service) => `${service.serviceName} ${service.serviceDesc}`).join(" "));
}

await writeNepseBook({
  broker: "Capital Max Securities",
  out: new URL("capitalmax-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /buy and sell of equity stocks, mutual funds, and debentures and bonds listed on the Nepal Stock Exchange/i },
    { url: `${SITE}/GetPublishedServices`, pattern: /Online Trading through Trade Management System \(TMS\)/i, text: serviceWords },
    { url: `${SITE}/GetPublishedServices`, pattern: /Rs 50,000 or Less Flat Rs 10 or 0\.36% \(whichever is higher\)/i, text: serviceWords },
  ],
});
