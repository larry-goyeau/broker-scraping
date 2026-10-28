// What Stoxkarts Securities (NEPSE broker no. 86, Dillibazar, Kathmandu)
// sells in shares, with no login. Its services page says that as a member
// "of the Nepal Stock Exchange (NEPSE), we facilitate the buying and
// selling of equities, debentures, and bonds through secure and efficient
// trade execution." It names no narrower set of shares, and every client
// orders through the exchange's TMS, where each member trades the whole
// board. So the book is every share NEPSE lets trade today, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there;
// bonds and mutual funds are left out there, like in the other Nepal
// catalogues). The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
//   https://stoxkarts.com.np/services/
//   https://stoxkarts.com.np/pricing/   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/stoxkarts/stoxkarts_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://stoxkarts.com.np";

await writeNepseBook({
  broker: "Stoxkarts Securities",
  out: new URL("stoxkarts-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services/`, pattern: /of the Nepal Stock Exchange \(NEPSE\), we facilitate the buying and selling of equities, debentures, and bonds/i },
    { url: `${SITE}/pricing/`, pattern: /From Rs\. 1 to Rs\. 50,000 0\.36 Percent/i },
  ],
});
