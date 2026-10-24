// What Thrive Brokerage House (NEPSE broker no. 13, Kathmandu, Pokhara and
// Damauli) sells in shares, with no login. Its services page says: "We
// provide Broking Services for buying and selling of all kinds of
// securities listed with Nepal Stock Exchange Ltd.(NEPSE)". Clients order
// through the exchange's TMS (tms13.nepsetms.com.np), so the book is every
// share NEPSE lets trade today, read from the exchange's company list by
// ./nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and left out
// is written there). Thrive publishes no security list of its own; the
// ticker on its home page (the symbols that traded on the last session it
// shows) is used as a check that both describe the same market.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
//   https://thrivebrokerage.com/category/services
//   https://thrivebrokerage.com/pages/fee-comission   (equity tariff)
//   https://thrivebrokerage.com/                       (ticker)
//   https://nepalstock.com.np/company
//
//   node brokers/thrive/thrive_scraping.mjs

import { writeNepseBook, getText } from "./nepseBook.mjs";

const SITE = "https://thrivebrokerage.com";
const home = await getText(`${SITE}/`);
const symbols = new Set([...home.matchAll(/<li>([A-Z0-9\/]+) [\d.]+<i style='color:/g)].map((m) => m[1]));
if (symbols.size < 150) throw new Error(`Thrive's ticker shows ${symbols.size} symbols`);

await writeNepseBook({
  broker: "Thrive Brokerage House",
  out: new URL("thrive-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/category/services`, pattern: /all kinds of securities listed with Nepal Stock Exchange/i },
    { url: `${SITE}/pages/fee-comission`, pattern: /Flat Rs ?10 or 0\.36%/i },
  ],
  symbols,
});
