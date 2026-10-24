// China Bank Securities (ChinaBankSec Online) sells online every
// non-suspended share listed on the Philippine Stock Exchange, in pesos
// only. There is no ChinaBankSec list, so the catalogue is the PSE board
// read by ../col/pseBook.mjs (what is kept and left out is written there),
// less the dollar lines (DTEL, TCB2A, TCB2B and any new one): the online
// platform does not take them. No page excludes ETFs, so the PSE ETF
// stays in.
//
//   "For your ChinaBankSec Online trading account, you can trade (buy/sell)
//    the shares of companies listed in the Philippine Stock Exchange (PSE)
//    except those under trading suspension. Trading of dollar-denominated
//    securities or DDS is not accommodated under the online trading
//    platform at the moment."   (FAQ faq3-1)
//
// Fees: the FAQ prints a range, not a rate: "Commissions which ranges
// between 0.25 to 1.0% of the amount traded and depends on the discretion
// of the broker as mutually agreed with the client" (faq5-1). The owner
// takes the 1.0 % ceiling as the commission (2026-10-24).
//
// The FAQ page is filled from the JSON below; both sentences are checked
// there on every run.
//
//   https://www.chinabankseconline.ph/
//   https://www.chinabankseconline.ph/CBSEC_DATA/downloadjson/cms3.json
//
//   node brokers/chinabanksec/chinabanksec_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { pseBook } from "../col/pseBook.mjs";

const FAQ = "https://www.chinabankseconline.ph/CBSEC_DATA/downloadjson/cms3.json";
const evidence = [
  /you can trade \(buy\/sell\) the shares of companies listed in the Philippine Stock Exchange \(PSE\) except those under trading suspension/,
  /Trading of dollar-denominated securities or DDS is not accommodated under the online trading platform/,
  /Commissions which ranges between 0\.25 to 1\.0% of the amount traded/,
];

const response = await fetch(FAQ, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`ChinaBankSec FAQ answered ${response.status}`);
const text = JSON.parse((await response.text()).replace(/^﻿/, ""))
  .map((entry) => entry.Description || "")
  .join(" ")
  .replace(/&nbsp;/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");
for (const pattern of evidence) {
  if (!pattern.test(text)) throw new Error(`ChinaBankSec FAQ no longer says ${pattern}`);
}

const { listed, suspended } = await pseBook();
const dollar = listed.filter((row) => row.currency !== "PHP");
const rows = listed
  .filter((row) => row.currency === "PHP" && ["STOCK", "ETF"].includes(row.type))
  .map(({ query, ticker, name, exchange, ...rest }) => ({ query, ticker, name, exchange, mic: "XPHS", ...rest }));
const kept = stampRows(withoutObligations(rows));
if (kept.length < 250) throw new Error(`only ${kept.length} PSE lines`);
fs.writeFileSync(new URL("chinabanksec-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = (type) => kept.filter((row) => row.type === type).length;
console.error(`${kept.length} listings (${count("STOCK")} STOCK, ${count("ETF")} ETF)`);
console.error(`${suspended.length} suspended left out`);
console.error(`dollar lines left out: ${dollar.map((row) => row.ticker).join(", ") || "none"}`);
