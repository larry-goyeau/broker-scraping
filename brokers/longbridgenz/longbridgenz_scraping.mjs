// Longbridge New Zealand sells Hong Kong and US shares and ETFs only. The
// markets come from the shared Longbridge reader in
// ../longbridge/longbridge_markets.mjs, which pages the public market lists
// and reads each counter's quote detail.
//
//   https://longbridge.com/nz
//   https://longbridge.com/en/markets/stock?market=hk&type=custom_top_gainers
//   https://mr.lbkrs.com/api/forward/newmarket/revision/rank/pc/list?key=all&market=US
//
// HKEX debt, US warrants and rights, and suspended or delisted counters are
// left out. No ISIN is published.
//
//   node brokers/longbridgenz/longbridgenz_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { longbridgeRows, logCounts } from "../longbridge/longbridge_markets.mjs";

const rows = await longbridgeRows(["HK", "US"]);
fs.writeFileSync(new URL("longbridgenz-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
logCounts(rows);
