// What N.I.M.B. Stock Markets (NEPSE broker no. 75, a subsidiary of Nepal
// Investment Mega Bank) sells in shares, with no login. Its home page says
// it acts "as intermediary between investor and NEPSE giving retail and
// institutional investors opportunity to buy and sell equities via stock
// exchange", and its brokerage page offers "Equity Trading" on the TMS
// platform, where every member trades the whole board; it also buys and
// sells promoter shares. It names no narrower set, so the book is every
// share NEPSE lets trade today, promoter lines included, read from the
// exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there:
// bonds, debentures and closed-end mutual funds are out, as in the other
// Nepal scrapers). Margin lending depends on the client and removes
// nothing. The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange. Everything trades
// in rupees.
//
//   https://nimbstock.com.np/
//   https://nimbstock.com.np/our-services/brokerage/
//   https://nimbstock.com.np/knowledge/fees-commission-and-cgt/   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/nimb/nimb_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://nimbstock.com.np";

await writeNepseBook({
  broker: "NIMB Stock Markets",
  out: new URL("nimb-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /intermediary between investor and NEPSE giving retail and institutional investors opportunity to buy and sell equities/i },
    { url: `${SITE}/knowledge/fees-commission-and-cgt/`, pattern: /Rs\. 50,000 or less 0\.36%/i },
  ],
});
