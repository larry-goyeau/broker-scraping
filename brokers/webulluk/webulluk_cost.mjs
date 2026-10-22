// What one round trip costs at Webull UK, Go and Meridian plans: buy n shares, sell them back.
// The fee card every Webull entity shares is ../webull/webull_cost.mjs;
// this file binds it to this entity's own catalogue (webulluk-parsed.json)
// and plans (uk-go, uk-meridian).
//
//   node brokers/webulluk/webulluk_cost.mjs AAPL NASDAQ USD --shares=10 --price=230 --plan=uk-go
//   node brokers/webulluk/webulluk_cost.mjs --schedule

import { makeRoundTrip, runCli } from "../webull/webull_cost.mjs";

export const roundTrip = makeRoundTrip({
  catalogueUrl: new URL("webulluk-parsed.json", import.meta.url),
  folder: "webulluk",
  plans: ["uk-go","uk-meridian"],
});

runCli(import.meta.url, roundTrip);
