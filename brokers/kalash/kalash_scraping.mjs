// What Kalash Stock Market (NEPSE broker, Kathmandu) sells in shares, with
// no login. Its brokerage page says: "Currently stock trading is allowed
// only on the stocks listed on Nepal Stock exchange Ltd." That sets the
// tradable universe to the NEPSE list and names no narrower set, and
// clients order through the exchange's TMS, where every member trades the
// whole board. So the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker publishes no security list of its own. broker-list.json gives
// one place, Nepal Stock Exchange, with no restriction. Everything trades
// in rupees.
//
//   https://kalashstock.com.np/services/stock-brokerage-services   (statement and tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/kalash/kalash_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const PAGE = "https://kalashstock.com.np/services/stock-brokerage-services";

await writeNepseBook({
  broker: "Kalash Stock Market",
  out: new URL("kalash-parsed.json", import.meta.url),
  evidence: [
    { url: PAGE, pattern: /stock trading is allowed only on the stocks listed on Nepal Stock exchange/i },
    { url: PAGE, pattern: /Rs\.50,000 0\.36 percent/i },
  ],
});
