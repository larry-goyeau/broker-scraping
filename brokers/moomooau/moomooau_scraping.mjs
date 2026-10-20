// What moomoo Australia sells: ASX, US (Nasdaq, NYSE and the other NBBO
// venues) and Hong Kong stocks and ETFs. moomoo AU publishes no list of
// its own: moomoo.com/au/quote lands on the moomoo group's quote site, and
// the lists below are the group's market lists shown on the entity's site
// ("all AU / US / HK stocks"), i.e. what is quoted on each exchange. The
// reader is shared with moomoo MY (moomooau_markets.mjs, which says what
// each market keeps and leaves out).
//
// The moomoo endpoint blocks an address for hours after a few dozen calls,
// so only the ASX list is read live (slowly); the US and Hong Kong
// lists are the same group lists as read by brokers/futuhk
// (../futuhk/futuhk-parsed.json; futuhk leaves Cboe BZX listings out).
// Pass --live to read them from the endpoint too.
//
//   https://www.moomoo.com/au/quote
//   https://www.moomoo.com/quote/au/stock-list/all-au-stocks
//   https://www.moomoo.com/quote/us/stock-list/all-us-stocks
//   https://www.moomoo.com/quote/hk/stock-list/all-hk-stocks
//
// The group lists also carry lines the exchange no longer quotes and, on
// the ASX, company options, warrants, instalments, deferred-settlement
// lines, hybrids and rights typed as stocks. Each market is checked
// against the exchange's own list (the ASX listed-company and ETP lists,
// the HKEX list of securities, the Nasdaq Trader symbol directory), the
// copied US and Hong Kong lines too; moomooau_markets.mjs gives the
// sources and the rules.
//
// ASX lines carry no ISIN: stampRows fills them from the shared lists.
// Hong Kong ISINs come from the HKEX list of securities.
//
//   node brokers/moomooau/moomooau_scraping.mjs
//   node brokers/moomooau/moomooau_scraping.mjs --live

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { logCounts, moomooRows, requireListing } from "./moomooau_markets.mjs";

const { rows, dropped } = await moomooRows(["AU", "US", "HK"]);
if (rows.length < 13000) throw new Error(`only ${rows.length} rows`);
requireListing(rows, [
  ["BHP", "ASX"],
  ["VAS", "ASX"],
  ["AAPL", "Nasdaq"],
  ["SPY", "NYSE Arca"],
  ["00700", "Hong Kong"],
]);
fs.writeFileSync(new URL("moomooau-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
logCounts(rows, dropped);
