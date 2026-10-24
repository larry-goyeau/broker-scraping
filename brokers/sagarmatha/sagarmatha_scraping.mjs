// What Sagarmatha Securities (NEPSE broker no. 18, Kathmandu) sells in
// shares, with no login. Its site is a React app whose words are in the
// script bundle; the brokerage service says: "As a SEBON-licensed broker,
// we facilitate buying and selling of all types of securities traded on
// NEPSE." Clients order through the exchange's TMS (tms18.nepsetms.com.np),
// so the book is every share NEPSE lets trade today, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees. The tariff ("Brokerage Charges & Commission", equity tab) is
// on the services page, from the same bundle.
//
//   https://sagarmathasecurities.com/services   (statement and equity tariff)
//   https://sagarmathasecurities.com/assets/index-*.js
//   https://nepalstock.com.np/company
//
//   node brokers/sagarmatha/sagarmatha_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://sagarmathasecurities.com";

// The page is a shell; its words are in the bundle it loads.
async function bundleWords(url) {
  const shell = await getText(url);
  const script = shell.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  if (!script) throw new Error(`${url} loads no bundle`);
  return getText(`${SITE}${script}`);
}

await writeNepseBook({
  broker: "Sagarmatha Securities",
  out: new URL("sagarmatha-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services`, pattern: /all types of securities traded on NEPSE/, text: bundleWords },
    { url: `${SITE}/services`, pattern: /rate:"0\.36% or Min Rs\. 10"/, text: bundleWords },
  ],
});
