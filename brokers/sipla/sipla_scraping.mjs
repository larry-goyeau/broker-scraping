// What Sipla Securities (NEPSE broker no. 20, New Road, Kathmandu) sells in
// shares, with no login. Its site is an Inertia app whose page data sits
// in the HTML (the data-page attribute), so the home page is read raw. Its
// online trading service says: "With our reliable TMS platform, you can
// trade NEPSE-listed securities from your home or office", and its account
// service promises "Access to NEPSE-listed stocks and instruments". It
// names no narrower set, and every client orders through the exchange's
// TMS, where each member trades the whole board. So the book is every
// share NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the site prints no tariff table; its share calculator holds the
// equity tariff in its script (ShareCalculator-*.js): 0.36% with a Rs 10
// minimum up to Rs 50,000, then 0.333%, 0.306%, 0.279% and 0.243%.
//
//   https://siplasecurities.com/                    (statement, in the page data)
//   https://siplasecurities.com/share-calculator
//   https://siplasecurities.com/build/assets/ShareCalculator-*.js   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/sipla/sipla_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://siplasecurities.com";

// The calculator page is a chunk named in the app bundle the home page loads.
async function calculatorScript(url) {
  const home = await getText(url);
  const app = home.match(/(\/build\/assets\/app-[^"]+\.js)/)?.[1];
  if (!app) throw new Error(`${url} loads no app bundle`);
  const bundle = await getText(`${SITE}${app}`);
  const chunk = bundle.match(/"\.\/Pages\/ShareCalculator\.jsx":\(\)=>\w+\(\(\)=>import\("\.\/(ShareCalculator-[^"]+\.js)"/)?.[1];
  if (!chunk) throw new Error(`${app} names no ShareCalculator chunk`);
  return getText(`${SITE}/build/assets/${chunk}`);
}

await writeNepseBook({
  broker: "Sipla Securities",
  out: new URL("sipla-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /you can trade NEPSE-listed securities from your home or office/, text: getText },
    { url: `${SITE}/`, pattern: /<=5e4\?Math\.max\(10,\w+\*\.0036\)/, text: calculatorScript },
  ],
});
