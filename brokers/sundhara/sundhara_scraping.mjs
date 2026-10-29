// What Sundhara Securities (NEPSE broker no. 52, Kathmandu) sells in
// shares, with no login. Its brokering service page says: "Brokering
// Service for all kind of securities listed with NEPSE, such as, shares
// and stocks, debentures and bonds, mutual fund units etc." Clients order
// online through the exchange's TMS, so the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the site prints no tariff table. Its share calculator (same
// template as ../ddkc) holds the tariff in its script (custom.js,
// get_broker_commision): 0.40% up to Rs 50,000, then 0.37%, 0.34%, 0.30%
// and 0.27%. That is the SEBON schedule in force before 2024, above
// today's 0.36% top rate.
//
//   https://sundharasecurities.com.np/service/brokering-service   (statement)
//   https://sundharasecurities.com.np/share-calculator
//   https://sundharasecurities.com.np/site/js/custom.js   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/sundhara/sundhara_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://sundharasecurities.com.np";

// The calculator page loads its tariff from custom.js.
async function calculatorScript(url) {
  const page = await getText(url);
  const script = page.match(/src="([^"]*\/site\/js\/custom\.js[^"]*)"/)?.[1];
  if (!script) throw new Error(`${url} loads no custom.js`);
  return getText(new URL(script, url).href);
}

await writeNepseBook({
  broker: "Sundhara Securities",
  out: new URL("sundhara-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/service/brokering-service`, pattern: /all kind of securities listed with NEPSE/i },
    {
      url: `${SITE}/share-calculator`,
      pattern: /function get_broker_commision[\s\S]{0,120}totalamount <= 50000\) \{\s*rate = '0\.40'/,
      text: calculatorScript,
    },
  ],
});
