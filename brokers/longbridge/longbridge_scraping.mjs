// Longbridge Securities Hong Kong (Long Bridge HK Limited) sells Hong Kong
// and US shares, Singapore shares, and Shanghai and Shenzhen A-shares
// through Northbound Stock Connect. The public market pages list every
// counter of each market; the shared reader in ./longbridge_markets.mjs
// pages those lists and reads each counter's quote detail.
//
//   https://longbridge.com/hk/en
//   https://longbridge.com/en/markets/stock?market=hk&type=custom_top_gainers
//   https://mr.lbkrs.com/api/forward/newmarket/revision/rank/pc/list?key=all&market=HK
//
// A-shares are only the counters the detail flags as Stock Connect. Bonds,
// warrants, rights and suspended or delisted counters are left out (see the
// shared reader). Longbridge publishes no ISIN.
//
//   node brokers/longbridge/longbridge_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { longbridgeRows, logCounts } from "./longbridge_markets.mjs";

const rows = await longbridgeRows(["HK", "US", "SG", "CN"]);
fs.writeFileSync(new URL("longbridge-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
logCounts(rows);
