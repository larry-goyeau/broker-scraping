// What RoadShow Securities (NEPSE broker no. 92, Kathmandu) sells in
// shares, with no login. Its services page says it "is a member of the
// Nepal Stock Exchange Ltd. (NEPSE)" and prints the stock brokerage charge
// for every trade on it. It names no narrower set (no board, segment or
// type left out), and every client orders through the exchange's TMS
// (tms.roadshowsecurities.com.np), where each member trades the whole
// board. So the book is every share NEPSE lets trade today, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees.
//
// The services page is filled by its own script, ourservices.js, which
// posts the page's paging settings to /GetPublishedServices and prints the
// answer (the services' names and texts as JSON). That answer is read here.
// Tariff: up to Rs 2,500 flat Rs 10, then 0.36% up to Rs 50,000, down to
// 0.24% above Rs 1 crore, plus SEBON fee 0.015% and Rs 25 DP charge.
//
//   https://roadshowsecurities.com.np/Services   (statement and tariff)
//   https://roadshowsecurities.com.np/GetPublishedServices
//   https://nepalstock.com.np/company
//
//   node brokers/roadshow/roadshow_scraping.mjs

import { writeNepseBook, pageWords } from "../thrive/nepseBook.mjs";

const SITE = "https://roadshowsecurities.com.np";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// The words of the services the Services page prints.
async function services() {
  const response = await fetch(`${SITE}/GetPublishedServices`, {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/json" },
    body: JSON.stringify({ pageNo: 1, itemsPerPage: 10, pagePerDisplay: 5, isHome: true }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${SITE}/GetPublishedServices answered ${response.status}`);
  const answer = await response.json();
  return pageWords((answer?.result?.data || []).map((v) => `<h2>${v.serviceName}</h2><div>${v.serviceDesc}</div>`).join(" "));
}

await writeNepseBook({
  broker: "Roadshow Securities",
  out: new URL("roadshow-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/Services`, pattern: /member of the Nepal Stock Exchange Ltd\. \(NEPSE\)/i, text: services },
    { url: `${SITE}/Services`, pattern: /Stock Brokerage Charge:.{0,200}From Rs 2501 to Rs 50,000 0\.36 Percent/i, text: services },
  ],
});
