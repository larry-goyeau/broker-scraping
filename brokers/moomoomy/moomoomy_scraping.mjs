// What moomoo Malaysia sells: Bursa Malaysia, US (Nasdaq, NYSE and the
// other NBBO venues), Hong Kong, Singapore, and China A-shares through
// Stock Connect. moomoo MY publishes no list of its own: moomoo.com/my/quote
// lands on the moomoo group's quote site, and the lists below are the
// group's market lists shown on the entity's site ("all MY / US / HK / SG
// stocks"), i.e. what is quoted on each exchange. The reader is shared with
// moomoo AU (../moomooau/moomooau_markets.mjs, which says what each market
// keeps and leaves out).
//
// The moomoo endpoint blocks an address for hours after a few dozen calls,
// so only the Bursa list is read live (slowly); the US, Hong Kong and
// Singapore lists are the same group lists as read by brokers/futuhk
// (../futuhk/futuhk-parsed.json; futuhk leaves Cboe BZX listings out).
// Pass --live to read them from the endpoint too.
//
//   https://www.moomoo.com/my/quote
//   https://www.moomoo.com/quote/my/stock-list/all-my-stocks
//   https://www.moomoo.com/quote/us/stock-list/all-us-stocks
//   https://www.moomoo.com/quote/hk/stock-list/all-hk-stocks
//   https://www.moomoo.com/quote/sg/stock-list/all-sg-stocks
//
// The group lists also carry lines the exchange no longer quotes and, on
// the SGX, government securities and retail bonds typed as stocks. Each
// market is checked against the exchange's own list (the SGX securities
// list, the HKEX list of securities, the Nasdaq Trader symbol directory),
// the copied lines too. Bursa LEAP Market lines (03xxx) stay out: the SC
// says the LEAP Market "currently caters exclusively to sophisticated
// investors" (sc.com.my, 18 May 2026). moomooau_markets.mjs gives the
// sources and the rules.
//
// A-shares are only the Northbound-eligible names (the HKEX China Connect
// lists, buy and sell), quoted in CNH. ChiNext (300-302) and STAR (688-689)
// stay with a remark: via Connect they are for professional investors only.
// Bursa lines carry no ISIN: stampRows fills them from the shared lists.
//
//   node brokers/moomoomy/moomoomy_scraping.mjs
//   node brokers/moomoomy/moomoomy_scraping.mjs --live

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { logCounts, moomooRows, requireListing } from "../moomooau/moomooau_markets.mjs";

const { rows, dropped } = await moomooRows(["MY", "US", "HK", "SG", "CN"]);
if (rows.length < 13000) throw new Error(`only ${rows.length} rows`);
requireListing(rows, [
  ["1155", "Bursa Malaysia"],
  ["AAPL", "Nasdaq"],
  ["SPY", "NYSE Arca"],
  ["00700", "Hong Kong"],
  ["D05", "Singapore Exchange"],
  ["600519", "Shanghai Stock Exchange"],
  ["300750", "Shenzhen Stock Exchange"],
]);
fs.writeFileSync(new URL("moomoomy-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
logCounts(rows, dropped);
