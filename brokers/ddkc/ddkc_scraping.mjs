// What Dipshikha Dhitopatra Karobar (NEPSE broker no. 38) sells in shares,
// with no login. Its brokering service page says: "Brokering Service for
// all kind of securities listed with NEPSE, such as, shares and stocks,
// debentures and bonds, mutual fund units etc." Clients order through the
// exchange's TMS (tms38.nepsetms.com.np), so the book is every share NEPSE
// lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own; the "Market Overview" block on its home page is empty.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// The site prints no tariff table. Its share calculator holds the tariff
// in its script (custom.js, get_broker_commision): 0.36% up to Rs 50,000,
// then 0.33%, 0.31%, 0.27% and 0.24%, plus a DP charge of Rs 25.
//
//   https://ddkc.com.np/service/brokering-service   (statement)
//   https://ddkc.com.np/share-calculator
//   https://ddkc.com.np/new_site/js/custom.js   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/ddkc/ddkc_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://ddkc.com.np";

// The calculator page loads its tariff from a versioned script.
async function calculatorScript(url) {
  const page = await getText(url);
  const script = page.match(/src="([^"]*\/new_site\/js\/custom\.js[^"]*)"/)?.[1];
  if (!script) throw new Error(`${url} loads no custom.js`);
  return getText(new URL(script, url).href);
}

await writeNepseBook({
  broker: "Dipshikha Dhitopatra Karobar",
  out: new URL("ddkc-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/service/brokering-service`, pattern: /all kind of securities listed with NEPSE/i },
    {
      url: `${SITE}/share-calculator`,
      pattern: /function get_broker_commision[\s\S]{0,120}totalamount <= 50000\) \{\s*rate = '0\.36'/,
      text: calculatorScript,
    },
  ],
});
