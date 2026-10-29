// What Machhapuchchhre Securities (MSL, NEPSE broker no. 76, a Machhapuchchhre
// Bank subsidiary) sells in shares, with no login. Its home page says:
// "Machhapuchchhre Securities Limited, a licensed share broker listed on
// the Nepal Stock Exchange (NEPSE)", "offering a comprehensive suite of
// services for trading in stocks", and "Open TMS Account Online" on the
// exchange's TMS (tms76.nepsetms.com.np). It names no narrower set, and on
// TMS every member trades the whole board. So the book is every share
// NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the FAQ "What are the brokerage charge and fees?" on the home page
// answers with the equity table ("Rs. 50,000 or less 0.36%", "Rs. 50,001
// to Rs. 500,000 0.33%" ...). The answer sits in the page's Nuxt data, so
// the page is read raw.
//
//   https://msl.com.np/   (statement, FAQ tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/machhapuchchhre/machhapuchchhre_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://msl.com.np";

await writeNepseBook({
  broker: "Machhapuchchhre Securities",
  out: new URL("machhapuchchhre-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /a licensed share broker listed on the Nepal Stock Exchange \(NEPSE\)/i },
    { url: `${SITE}/`, pattern: /What are the brokerage charge and fees\?/i },
    { url: `${SITE}/`, pattern: /Rs\. 50,000 or less\\u003C\/td>[\s\S]{0,80}?0\.36%/, text: getText },
  ],
});
