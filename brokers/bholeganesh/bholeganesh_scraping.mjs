// What Bhole Ganesh Securities (NEPSE broker no. 61, Anamnagar, Kathmandu)
// sells in shares, with no login. Its brokerage page says: "We act as
// intermediaries that connects buyers and sellers to facilate Equity,
// Debenture and Bond transaction", and its online trading page: "We offer
// Online Trading through Trade Management System (TMS). Our Valued clients
// can place buy/sell orders through TMS". It names no narrower set, and on
// TMS every member trades the whole board. So the book is every share
// NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the brokerage page prints "As per rules of Securities Board of
// Nepal the stock brokerage charges per transaction": Flat Rs. 10 up to
// Rs 2,500, then 0.36% up to Rs 50,000 down to 0.24%.
//
//   https://bholeganesh.com/service/brokerage-services1        (statement, tariff)
//   https://bholeganesh.com/service/online-trading-system      (TMS)
//   https://nepalstock.com.np/company
//
//   node brokers/bholeganesh/bholeganesh_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://bholeganesh.com";

await writeNepseBook({
  broker: "Bhole Ganesh Securities",
  out: new URL("bholeganesh-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/service/brokerage-services1`, pattern: /connects buyers and sellers to facilate Equity/i },
    { url: `${SITE}/service/brokerage-services1`, pattern: /2,501 50,000 0\.36%/ },
    { url: `${SITE}/service/online-trading-system`, pattern: /place buy\/sell orders through TMS/i },
  ],
});
