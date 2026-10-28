// What Primo Securities (NEPSE broker no. 16, Kathmandu) sells in shares,
// with no login. Its site is a React app whose words are in the script
// bundle; the brokerage page says: "Trade equity, mutual funds, bonds, and
// debentures listed in the Nepal Stock Exchange (NEPSE) with confidence",
// and the services list: "buying and selling of equities, corporate
// debentures, and government bonds listed on NEPSE". It names no narrower
// set, and clients order through the exchange's TMS, so the book is every
// share NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there: debentures and closed-end mutual funds are
// left out, as in the other Nepal catalogues). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees. The tariff
// ("Brokerage Charges in Nepal", equity: 0.40% up to 50,000 down to 0.27%)
// is on the brokerage page, from the same bundle.
//
//   https://www.primosecurities.com.np/services/brokerage   (statement and tariff)
//   https://www.primosecurities.com.np/assets/index-*.js
//   https://nepalstock.com.np/company
//
//   node brokers/primo/primo_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://www.primosecurities.com.np";

// The page is a shell; its words are in the bundle it loads.
async function bundleWords(url) {
  const shell = await getText(url);
  const script = shell.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  if (!script) throw new Error(`${url} loads no bundle`);
  return getText(`${SITE}${script}`);
}

await writeNepseBook({
  broker: "Primo Securities",
  out: new URL("primo-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services/brokerage`, pattern: /Trade equity, mutual funds, bonds, and debentures listed in the Nepal Stock Exchange/, text: bundleWords },
    { url: `${SITE}/services/brokerage`, pattern: /equity:\[\{amount:"Up to 50,000",fee:"0\.40%"\}/, text: bundleWords },
  ],
});
