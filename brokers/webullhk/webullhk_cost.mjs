// What one round trip costs at Webull Hong Kong: buy n shares, sell them back.
// The fee card every Webull entity shares is ../webull/webull_cost.mjs;
// this file binds it to this entity's own catalogue (webullhk-parsed.json)
// and plan (hk).
//
//   node brokers/webullhk/webullhk_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/webullhk/webullhk_cost.mjs --schedule

import { makeRoundTrip, runCli } from "../webull/webull_cost.mjs";

export const roundTrip = makeRoundTrip({
  catalogueUrl: new URL("webullhk-parsed.json", import.meta.url),
  folder: "webullhk",
  plans: ["hk"],
});

runCli(import.meta.url, roundTrip);
