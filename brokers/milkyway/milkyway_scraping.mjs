// What Milky Way Share Broker Company (NEPSE broker no. 84) sells in shares,
// with no login. Its services page offers "Trading Services": "Facilitating
// the buying and selling of NEPSE-listed stocks on behalf of clients
// through online and offline trading platforms with real-time execution."
// It names no narrower set, and online orders go through the exchange's
// TMS, where every member trades the whole board. So the book is every
// share NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the pricing page prints "Our charges are regulated by SEBON": Flat
// Rs. 10 up to Rs 2,500, then "Rs. 2,501 – Rs. 50,000 0.36%" down to
// "Above Rs. 1,00,00,000 0.24%".
//
//   https://milkywaysharebroker.com.np/services   (statement)
//   https://milkywaysharebroker.com.np/pricing    (equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/milkyway/milkyway_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://milkywaysharebroker.com.np";

await writeNepseBook({
  broker: "Milky Way Share Broker Company",
  out: new URL("milkyway-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services/`, pattern: /buying and selling of NEPSE-listed stocks on behalf of clients through online and offline trading platforms/i },
    { url: `${SITE}/pricing/`, pattern: /Rs\. 2,501 . Rs\. 50,000 0\.36%/i },
  ],
});
