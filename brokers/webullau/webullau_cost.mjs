// What one round trip costs at Webull Australia: buy n shares, sell them back.
// The fee card every Webull entity shares is ../webull/webull_cost.mjs;
// this file binds it to this entity's own catalogue (webullau-parsed.json)
// and plan (au).
//
//   node brokers/webullau/webullau_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/webullau/webullau_cost.mjs --schedule

import { makeRoundTrip, runCli } from "../webull/webull_cost.mjs";

export const roundTrip = makeRoundTrip({
  catalogueUrl: new URL("webullau-parsed.json", import.meta.url),
  folder: "webullau",
  plans: ["au"],
});

runCli(import.meta.url, roundTrip);
