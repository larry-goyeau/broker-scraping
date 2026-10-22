// What one round trip costs at Webull Europe (Webull Securities (Europe) B.V.): buy n shares, sell them back.
// The fee card every Webull entity shares is ../webull/webull_cost.mjs;
// this file binds it to this entity's own catalogue (webulleu-parsed.json)
// and plan (eu).
//
//   node brokers/webulleu/webulleu_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/webulleu/webulleu_cost.mjs --schedule

import { makeRoundTrip, runCli } from "../webull/webull_cost.mjs";

export const roundTrip = makeRoundTrip({
  catalogueUrl: new URL("webulleu-parsed.json", import.meta.url),
  folder: "webulleu",
  plans: ["eu"],
});

runCli(import.meta.url, roundTrip);
