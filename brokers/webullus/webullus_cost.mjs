// What one round trip costs at Webull US (Webull Financial LLC): buy n shares, sell them back.
// The fee card every Webull entity shares is ../webull/webull_cost.mjs;
// this file binds it to this entity's own catalogue (webullus-parsed.json)
// and plan (us).
//
//   node brokers/webullus/webullus_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/webullus/webullus_cost.mjs --schedule

import { makeRoundTrip, runCli } from "../webull/webull_cost.mjs";

export const roundTrip = makeRoundTrip({
  catalogueUrl: new URL("webullus-parsed.json", import.meta.url),
  folder: "webullus",
  plans: ["us"],
});

runCli(import.meta.url, roundTrip);
