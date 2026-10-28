// What Midas Stock Broking Company (NEPSE broker no. 21, Kathmandu and
// Butwal) sells in shares, with no login. Its about page says it is "the
// 21st broker member of NEPSE" and provides "comprehensive order execution
// and depository services to investors trading in NEPSE". It names no
// narrower set, and clients order through the exchange's TMS ("The NEPSE
// Online Account is used to place actual buy and sell orders in the
// market", FAQ), so the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// Midas publishes no security list of its own; the price ticker on its
// pages (the symbols of the last session it shows) is used as a check that
// both describe the same market. broker-list.json gives one place, Nepal
// Stock Exchange, with no restriction. Everything trades in rupees. The
// tariff ("Brokerage Commission", flat Rs. 10 up to Rs. 2,500, then 0.36%
// down to 0.24%) is on the pricing page.
//
//   https://midasstock.com.np/about
//   https://midasstock.com.np/pricing   (tariff and ticker)
//   https://nepalstock.com.np/company
//
//   node brokers/midas/midas_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://midasstock.com.np";
const pricing = await getText(`${SITE}/pricing`);
const symbols = new Set(
  [...pricing.matchAll(/<span class="font-semibold text-white">([A-Z][A-Z0-9\/]*)<\/span><span class="font-semibold tabular-nums/g)].map((m) => m[1]),
);
if (symbols.size < 150) throw new Error(`Midas's ticker shows ${symbols.size} symbols`);

await writeNepseBook({
  broker: "Midas Stock Broking Company",
  out: new URL("midas-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/about`, pattern: /order execution and depository services to investors trading in NEPSE/i },
    { url: `${SITE}/pricing`, pattern: /From Rs\. 2,501 to Rs\. 50,000 0\.36%/i },
  ],
  symbols,
});
