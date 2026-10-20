// Longbridge Singapore (Long Bridge Securities Pte. Ltd., MAS licence
// CMS101211) sells US, Hong Kong and Singapore shares and ETFs. Its site
// names no A-share trading, so China is not read. The markets come from
// the shared Longbridge reader in ../longbridgehk/longbridgehk_markets.mjs,
// which pages the public market lists and reads each counter's detail.
//
//   https://longbridge.com/sg/
//   https://longbridge.com/en/markets/stock?market=sg&type=custom_top_gainers
//   https://mr.lbkrs.com/api/forward/newmarket/revision/rank/pc/list?key=all&market=SG
//
// SGX warrants, rights and bonds, HKEX debt, US warrants and rights, and
// suspended or delisted counters are left out. No ISIN is published.
//
//   node brokers/longbridgesg/longbridgesg_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { longbridgeRows, logCounts } from "../longbridgehk/longbridgehk_markets.mjs";

const rows = await longbridgeRows(["SG", "HK", "US"]);
fs.writeFileSync(new URL("longbridgesg-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
logCounts(rows);
