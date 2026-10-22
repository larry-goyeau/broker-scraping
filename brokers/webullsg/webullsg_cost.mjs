// What one round trip costs at Webull Singapore: buy n shares, sell them back.
// The fee card every Webull entity shares is ../webull/webull_cost.mjs;
// this file binds it to this entity's own catalogue (webullsg-parsed.json)
// and plan (sg).
//
//   node brokers/webullsg/webullsg_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/webullsg/webullsg_cost.mjs --schedule

import { makeRoundTrip, runCli } from "../webull/webull_cost.mjs";

export const roundTrip = makeRoundTrip({
  catalogueUrl: new URL("webullsg-parsed.json", import.meta.url),
  folder: "webullsg",
  plans: ["sg"],
});

runCli(import.meta.url, roundTrip);
