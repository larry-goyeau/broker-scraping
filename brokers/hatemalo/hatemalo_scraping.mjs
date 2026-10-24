// What Hatemalo Financial Services (NEPSE broker no. 72) sells in shares,
// with no login. Its brokerage page says: "Brokering Service for all kind
// of securities listed with NEPSE, such as, shares and stocks, debentures
// and bonds, mutual fund units etc." Clients order through the exchange's
// TMS (tms72.nepsetms.com.np), so the book is every share NEPSE lets trade
// today, read from the exchange's company list by ../thrive/nepseBook.mjs
// and ../kumari/nepseShares.mjs (what is kept and left out is written
// there). The broker publishes no security list of its own.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
//   https://hatemalo.com.np/brokerage-services.html   (statement and tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/hatemalo/hatemalo_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const PAGE = "https://hatemalo.com.np/brokerage-services.html";

await writeNepseBook({
  broker: "Hatemalo Financial Services",
  out: new URL("hatemalo-parsed.json", import.meta.url),
  evidence: [
    { url: PAGE, pattern: /all kind of securities listed with NEPSE/i },
    { url: PAGE, pattern: /Rs\. 50,000 0\.36 Percent/i },
  ],
});
