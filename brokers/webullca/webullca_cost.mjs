// What one round trip costs at Webull Canada: buy n shares, sell them back.
// The fee card every Webull entity shares is ../webull/webull_cost.mjs;
// this file binds it to this entity's own catalogue (webullca-parsed.json)
// and plan (ca).
//
//   node brokers/webullca/webullca_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/webullca/webullca_cost.mjs --schedule

import { makeRoundTrip, runCli } from "../webull/webull_cost.mjs";

export const roundTrip = makeRoundTrip({
  catalogueUrl: new URL("webullca-parsed.json", import.meta.url),
  folder: "webullca",
  plans: ["ca"],
});

runCli(import.meta.url, roundTrip);
