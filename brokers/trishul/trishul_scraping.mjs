// What Trishul Securities and Investment (NEPSE broker no. 29) sells in
// shares. It publishes no security list of its own; clients order through
// the exchange's TMS (tms29.nepsetms.com.np), where every member trades the
// whole board, and its services page names no narrower set. Its equity
// tariff is the regulator's band ("The Broker commission rate is fixed by
// the regulatory authorities": 0.36% up to Rs 50,000 ... 0.24% from Rs 1
// crore) with Rs 25 a DP transfer. The site sits behind a Cloudflare
// challenge that plain HTTP clients cannot pass, so the page was read in a
// browser on 2026-10-25 and is not re-checked at run time.
//
// The owner's rule for a broker with a single place and no published list
// (2026-10-25): take the whole place. So the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). broker-list.json gives one place, Nepal Stock
// Exchange. Everything trades in rupees.
//
//   https://trishulsecurities.com.np/our-services/   (equity and DP tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/trishul/trishul_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

await writeNepseBook({
  broker: "Trishul Securities and Investment",
  out: new URL("trishul-parsed.json", import.meta.url),
  evidence: [],
});
